const { getDb } = require('./_db');
const { requireAdmin } = require('./auth/_admin');
const { readSession } = require('./auth/_session');

// 앱 푸시(FCM) — 기기 토큰 + 관심위치 저장 테이블(로그인 안 해도 기기 단위). 설계: docs/product/16-push-notifications.md
async function ensurePushTables(db) {
  try { await db.execute("CREATE TABLE IF NOT EXISTS push_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, device_id TEXT, platform TEXT, token TEXT UNIQUE, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"); } catch (e) {}
  try { await db.execute("CREATE TABLE IF NOT EXISTS push_prefs (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT UNIQUE, user_id INTEGER, lat REAL, lng REAL, radius_km REAL DEFAULT 5, categories TEXT, digest TEXT DEFAULT 'instant', enabled INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))"); } catch (e) {}
}

// POST /api/users?push=register {token, platform, deviceId} · ?push=prefs {deviceId, lat, lng, radiusKm?, categories?, enabled?}
async function handlePushPost(req, res, db, kind) {
  const body = req.body || {};
  const session = readSession(req);
  const userId = (session && session.userId) ? session.userId : null;
  await ensurePushTables(db);
  if (kind === 'register') {
    const token = String(body.token || '').trim();
    const deviceId = String(body.deviceId || '').trim();
    const platform = (body.platform === 'ios' || body.platform === 'android') ? body.platform : null;
    if (!token || !deviceId) return res.status(400).json({ error: 'token, deviceId required' });
    await db.execute({
      sql: "INSERT INTO push_tokens (user_id, device_id, platform, token, enabled, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now')) ON CONFLICT(token) DO UPDATE SET user_id=COALESCE(excluded.user_id, user_id), device_id=excluded.device_id, platform=excluded.platform, enabled=1, updated_at=datetime('now')",
      args: [userId, deviceId, platform, token],
    });
    // 같은 기기의 옛 토큰(FCM 갱신으로 남은 것)은 비활성화 → 기기당 최신 1개만 유지(중복 알림 방지)
    await db.execute({ sql: "UPDATE push_tokens SET enabled=0 WHERE device_id=? AND token!=?", args: [deviceId, token] });
    return res.status(200).json({ ok: true });
  }
  if (kind === 'prefs') {
    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
    const la = Number(body.lat), ln = Number(body.lng);
    const radius = Number(body.radiusKm) > 0 ? Number(body.radiusKm) : 5;
    const cats = (body.categories && String(body.categories).trim()) ? String(body.categories).trim() : null;
    const enabled = (body.enabled === false || body.enabled === 0) ? 0 : 1;
    await db.execute({
      sql: "INSERT INTO push_prefs (device_id, user_id, lat, lng, radius_km, categories, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(device_id) DO UPDATE SET user_id=COALESCE(excluded.user_id, user_id), lat=excluded.lat, lng=excluded.lng, radius_km=excluded.radius_km, categories=excluded.categories, enabled=excluded.enabled, updated_at=datetime('now')",
      args: [deviceId, userId, isFinite(la) ? la : null, isFinite(ln) ? ln : null, radius, cats, enabled],
    });
    return res.status(200).json({ ok: true });
  }
  if (kind === 'broadcast') {
    // 이벤트/공지 전체 발송(관리자 전용)
    if (!requireAdmin(req, res)) return;
    const { serviceAccount, sendToTokens } = require('./_push');
    if (!serviceAccount()) return res.status(400).json({ error: 'FIREBASE_SERVICE_ACCOUNT 미설정' });
    const title = String(body.title || '').trim();
    const bd = String(body.body || '').trim();
    if (!title || !bd) return res.status(400).json({ error: '제목·내용은 필수' });
    const data = {};
    if (body.placeId != null && String(body.placeId).trim() !== '') data.placeId = String(body.placeId).trim();
    if (body.url && String(body.url).trim()) data.url = String(body.url).trim();
    const toks = (await db.execute("SELECT token FROM push_tokens WHERE enabled=1")).rows.map(r => r.token).filter(Boolean);
    if (!toks.length) return res.status(200).json({ sent: 0, failed: 0, devices: 0 });
    const r = await sendToTokens(toks, { title, body: bd, data });
    if (r.invalid && r.invalid.length) { // 무효 토큰 비활성화
      const ph = r.invalid.map(() => '?').join(',');
      try { await db.execute({ sql: `UPDATE push_tokens SET enabled=0 WHERE token IN (${ph})`, args: r.invalid }); } catch (e) {}
    }
    return res.status(200).json({ sent: r.sent, failed: r.failed, devices: toks.length });
  }
  return res.status(400).json({ error: 'unknown push action' });
}

// ===== 내 장소(집/회사/여행지) — 로그인 계정 기반. Phase1. docs/product/17-travel-pins.md =====
async function ensureUserPlacesTable(db) {
  try {
    await db.execute("CREATE TABLE IF NOT EXISTS user_places (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT, address TEXT, lat REAL, lng REAL, radius_km REAL DEFAULT 3, categories TEXT, alarm_enabled INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))");
  } catch (e) {}
  try { await db.execute("CREATE INDEX IF NOT EXISTS idx_user_places_user ON user_places(user_id)"); } catch (e) {}
}

function toUserPlace(row) {
  let cats = [];
  try { cats = row.categories ? JSON.parse(row.categories) : []; } catch (e) { cats = []; }
  return {
    id: row.id,
    kind: row.kind,                              // home | work | place
    name: row.name || '',
    address: row.address || '',
    lat: row.lat, lng: row.lng,
    radiusKm: Number(row.radius_km || 3),
    categories: Array.isArray(cats) ? cats : [],
    alarmEnabled: !!row.alarm_enabled,
  };
}

// 내 장소 CRUD (로그인 필수). GET=목록 / POST=저장(신규·수정) / DELETE=삭제
async function handleUserPlaces(req, res, db) {
  const session = readSession(req);
  const userId = (session && session.userId) ? session.userId : null;
  if (!userId) return res.status(401).json({ error: 'login_required' });
  await ensureUserPlacesTable(db);

  if (req.method === 'GET') {
    const r = await db.execute({
      // 집→회사→나머지(등록순) 정렬
      sql: "SELECT * FROM user_places WHERE user_id=? ORDER BY CASE kind WHEN 'home' THEN 0 WHEN 'work' THEN 1 ELSE 2 END, id ASC",
      args: [userId],
    });
    return res.status(200).json(r.rows.map(toUserPlace));
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'id required' });
    await db.execute({ sql: "DELETE FROM user_places WHERE id=? AND user_id=?", args: [id, userId] });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const kind = (['home', 'work', 'place'].indexOf(body.kind) >= 0) ? body.kind : null;
    if (!kind) return res.status(400).json({ error: 'kind required (home|work|place)' });
    const la = Number(body.lat), ln = Number(body.lng);
    if (!isFinite(la) || !isFinite(ln) || la < 33 || la > 39 || ln < 124 || ln > 132) {
      return res.status(400).json({ error: 'invalid coords' });
    }
    let radius = Number(body.radiusKm);
    if (!(radius >= 1 && radius <= 5)) radius = 3;
    const name = String(body.name || (kind === 'home' ? '집' : kind === 'work' ? '회사' : '')).trim().slice(0, 40);
    const address = String(body.address || '').trim().slice(0, 200);
    let cats = [];
    if (Array.isArray(body.categories)) cats = body.categories.filter(c => typeof c === 'string').slice(0, 12);
    const catsJson = JSON.stringify(cats);
    const alarm = (body.alarmEnabled === true || body.alarmEnabled === 1) ? 1 : 0;
    const id = Number(body.id);

    if (id) {
      // 수정(본인 소유만)
      const own = (await db.execute({ sql: "SELECT id FROM user_places WHERE id=? AND user_id=?", args: [id, userId] })).rows[0];
      if (!own) return res.status(404).json({ error: 'not found' });
      await db.execute({
        sql: "UPDATE user_places SET kind=?, name=?, address=?, lat=?, lng=?, radius_km=?, categories=?, alarm_enabled=?, updated_at=datetime('now') WHERE id=? AND user_id=?",
        args: [kind, name, address, la, ln, radius, catsJson, alarm, id, userId],
      });
      return res.status(200).json({ ok: true, id });
    }

    // 신규: 집/회사는 1개만(있으면 기존 것을 갱신)
    if (kind === 'home' || kind === 'work') {
      const ex = (await db.execute({ sql: "SELECT id FROM user_places WHERE user_id=? AND kind=? LIMIT 1", args: [userId, kind] })).rows[0];
      if (ex) {
        await db.execute({
          sql: "UPDATE user_places SET name=?, address=?, lat=?, lng=?, radius_km=?, categories=?, alarm_enabled=?, updated_at=datetime('now') WHERE id=?",
          args: [name, address, la, ln, radius, catsJson, alarm, ex.id],
        });
        return res.status(200).json({ ok: true, id: ex.id });
      }
    }
    // 최대 10개 제한
    const cnt = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM user_places WHERE user_id=?", args: [userId] })).rows[0];
    if (Number(cnt.n || 0) >= 10) return res.status(400).json({ error: 'limit_reached' });
    const ins = await db.execute({
      sql: "INSERT INTO user_places (user_id, kind, name, address, lat, lng, radius_km, categories, alarm_enabled) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [userId, kind, name, address, la, ln, radius, catsJson, alarm],
    });
    return res.status(200).json({ ok: true, id: Number(ins.lastInsertRowid) });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
}

function toUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    nickname: row.nickname || '',
    email: row.email || '',
    urlPlatform: row.url_platform || '',
    urlId: row.url_id || '',
    signupSource: row.signup_source || '',   // 가입 유입경로
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || '',           // 최종접속 시각(UTC, 어드민에서 KST 변환) — 신규 접속부터
    lastVisitDate: row.last_visit_date || '',     // 최종접속 날짜(시각 없음) — last_seen_at 없는 기존 회원 폴백
    reportCount: Number(row.report_count || 0),   // 협찬 제보수(캠페인)
    reviewCount: Number(row.review_count || 0),   // 후기 등록수
    visitCount: Number(row.visit_count || 0)      // 접속수(1일 1회)
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();

  // ⚠️ 개발 전용 미리보기 로그인 — dev.db(file:)일 때만 동작, 운영(libsql://)에선 완전 무효(404).
  // LAN(http) 프리뷰에서 OAuth 콜백이 운영도메인으로 가 로그인 불가한 문제 우회. non-Secure 쿠키(http용).
  if (req.query.devlogin !== undefined) {
    if (!String(process.env.TURSO_DATABASE_URL || '').startsWith('file:')) return res.status(404).json({ error: 'not found' });
    try { await db.execute("INSERT INTO users (provider, provider_user_id, nickname) VALUES ('dev','dev-preview','미리보기') ON CONFLICT(provider, provider_user_id) DO NOTHING"); } catch (e) {}
    const u = (await db.execute("SELECT id, nickname, provider FROM users WHERE provider='dev' AND provider_user_id='dev-preview'")).rows[0];
    const crypto = require('crypto');
    const payload = { userId: Number(u.id), nickname: u.nickname, provider: u.provider, exp: Date.now() + 30 * 24 * 3600 * 1000 };
    const p64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(p64).digest('base64url');
    res.setHeader('Set-Cookie', `mhm_session=${p64}.${sig}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`);
    res.statusCode = 302; res.setHeader('Location', '/'); return res.end();
  }

  // 앱 푸시 토큰/관심위치 등록(공개, 기기 단위) — GET 전용 가드보다 먼저.
  if (req.method === 'POST' && req.query.push) {
    return handlePushPost(req, res, db, req.query.push);
  }

  // 내 장소(집/회사/여행지) CRUD — 로그인 계정 기반. GET/POST/DELETE 모두 여기서(GET 가드 이전).
  if (req.query.places !== undefined) {
    return handleUserPlaces(req, res, db);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 이벤트 푸시 대상 기기수(관리자) — 발송 전 미리보기용
  if (req.query.push === 'count') {
    if (!requireAdmin(req, res)) return;
    await ensurePushTables(db);
    const c = (await db.execute("SELECT COUNT(*) AS n FROM push_tokens WHERE enabled=1")).rows[0] || {};
    return res.status(200).json({ devices: Number(c.n || 0) });
  }

  // 대시보드 회원 '수'만 필요할 때: 전체 목록(상관 서브쿼리로 수 초) 대신 COUNT 1줄 → 즉시.
  if (req.query.count) {
    if (!requireAdmin(req, res)) return;
    const c = (await db.execute("SELECT COUNT(*) AS n FROM users")).rows[0] || {};
    return res.status(200).json({ count: Number(c.n || 0) });
  }

  if (req.query.leaderboard) {
    const result = await db.execute(`
      SELECT u.nickname AS nickname, COUNT(*) AS count
      FROM places p
      JOIN users u ON u.id = p.founder_user_id
      WHERE p.founder_user_id IS NOT NULL
      GROUP BY p.founder_user_id
      ORDER BY count DESC, MIN(p.created_at) ASC
      LIMIT 1
    `);
    const top = result.rows[0];
    if (!top) return res.status(200).json({ nickname: '', count: 0 });
    return res.status(200).json({ nickname: top.nickname || '', count: Number(top.count) });
  }

  // 전체 회원 목록(이메일 등 PII 포함)은 관리자만
  if (!requireAdmin(req, res)) return;
  // 집계용 테이블 보장(후기/접속 테이블이 아직 없을 수 있음)
  try { await db.execute("CREATE TABLE IF NOT EXISTS user_visits (user_id INTEGER NOT NULL, visit_date TEXT NOT NULL, UNIQUE(user_id, visit_date))"); } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN last_seen_at TEXT"); } catch (e) {}
  // 회원별 제보수/후기수 상관 서브쿼리(회원마다 campaigns/reviews 스캔)가 인덱스 없이 수 초 걸림 → 인덱스로 seek.
  try { await db.execute("CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id)"); } catch (e) {}
  try { await db.execute("CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)"); } catch (e) {}
  const result = await db.execute(`
    SELECT u.*,
      (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) AS report_count,
      (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS review_count,
      (SELECT COUNT(*) FROM user_visits v WHERE v.user_id = u.id) AS visit_count,
      (SELECT MAX(v.visit_date) FROM user_visits v WHERE v.user_id = u.id) AS last_visit_date
    FROM users u ORDER BY u.id DESC`);
  return res.status(200).json(result.rows.map(toUser));
};
