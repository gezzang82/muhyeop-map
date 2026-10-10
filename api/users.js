const { getDb } = require('./_db');
const { requireAdmin } = require('./auth/_admin');
const { readSession } = require('./auth/_session');
const { enforceRateLimit } = require('./_ratelimit');

// 서이추 글 테이블 보장(최초 1회)
async function ensureSeoichuTable(db) {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS seoichu_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      hidden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`);
    await db.execute("CREATE INDEX IF NOT EXISTS idx_seoichu_created ON seoichu_posts(created_at)");
  } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN profile_image TEXT"); } catch (e) {}
}

// 서이추 글쓰기(공개 아님 — 로그인 + 블로그 등록자만). content 200자 제한, 레이트리밋.
async function handleSeoichuPost(req, res, db) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
  if (!await enforceRateLimit(req, res, { name: 'seoichu', limit: 10, windowSec: 300 })) return;
  await ensureSeoichuTable(db);
  // SNS(블로그/인스타) 등록 여부 확인 — 이웃찾기는 블로그·인스타 모두 가능
  const u = (await db.execute({ sql: "SELECT url_platform, url_id FROM users WHERE id = ?", args: [session.userId] })).rows[0];
  if (!u || !u.url_id || (u.url_platform !== '블로그' && u.url_platform !== '인스타그램')) {
    return res.status(400).json({ error: 'SNS 계정을 먼저 등록해주세요.', needBlog: true });
  }
  const content = String((req.body && req.body.content) || '').replace(/\s*\n\s*/g, ' ').trim().slice(0, 100);
  if (!content) return res.status(400).json({ error: '내용을 입력해주세요.' });
  const { hasProfanity } = require('./_profanity');
  if (hasProfanity(content)) return res.status(400).json({ error: '부적절한 표현이 포함되어 있어요. 수정 후 다시 등록해주세요.' });
  await db.execute({ sql: "INSERT INTO seoichu_posts (user_id, content) VALUES (?, ?)", args: [session.userId, content] });
  return res.status(201).json({ ok: true });
}

// 이웃찾기 글 삭제 — 로그인 + 본인 글만(DELETE ?seoichu=1&id=).
async function handleSeoichuDelete(req, res, db) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'id가 필요해요.' });
  await ensureSeoichuTable(db);
  const r = await db.execute({ sql: "DELETE FROM seoichu_posts WHERE id = ? AND user_id = ?", args: [id, session.userId] });
  if (!r.rowsAffected) return res.status(404).json({ error: '삭제할 글이 없거나 권한이 없어요.' });
  return res.status(200).json({ ok: true });
}

// 앱 푸시(FCM) — 기기 토큰 + 관심위치 저장 테이블(로그인 안 해도 기기 단위). 설계: docs/product/16-push-notifications.md
async function ensurePushTables(db) {
  try { await db.execute("CREATE TABLE IF NOT EXISTS push_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, device_id TEXT, platform TEXT, token TEXT UNIQUE, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"); } catch (e) {}
  try { await db.execute("CREATE TABLE IF NOT EXISTS push_prefs (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT UNIQUE, user_id INTEGER, lat REAL, lng REAL, radius_km REAL DEFAULT 5, categories TEXT, digest TEXT DEFAULT 'instant', enabled INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))"); } catch (e) {}
  // 알림 '탭'(앱 접근) 집계 — kind=digest(하루요약)|event(이벤트푸시). 로그인 유저면 user_id 귀속(비로그인 NULL).
  try { await db.execute("CREATE TABLE IF NOT EXISTS push_opens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, device_id TEXT, place_id INTEGER, kind TEXT, created_at TEXT DEFAULT (datetime('now')))"); } catch (e) {}
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
  if (kind === 'open') {
    // 알림 탭(앱 접근) 1건 기록. 공개(기기 단위) — 로그인 시 user_id 귀속. fail-open.
    try {
      const pid = Number(body.placeId); const k = (body.kind === 'digest' || body.kind === 'event') ? body.kind : null;
      await db.execute({ sql: "INSERT INTO push_opens (user_id, device_id, place_id, kind) VALUES (?, ?, ?, ?)", args: [userId, String(body.deviceId || '') || null, isFinite(pid) ? pid : null, k] });
    } catch (e) {}
    return res.status(200).json({ ok: true });
  }
  if (kind === 'digestpref') {
    // 하루요약 마스터 토글(users.push_digest_enabled). 로그인 필수.
    if (!userId) return res.status(401).json({ error: '로그인이 필요해요.' });
    try { await db.execute("ALTER TABLE users ADD COLUMN push_digest_enabled INTEGER DEFAULT 1"); } catch (e) {}
    const on = (body.enabled === false || body.enabled === 0) ? 0 : 1;
    await db.execute({ sql: "UPDATE users SET push_digest_enabled=? WHERE id=?", args: [on, userId] });
    return res.status(200).json({ ok: true, enabled: on });
  }
  if (kind === 'broadcast') {
    // 이벤트/공지 전체 발송(관리자 전용)
    if (!requireAdmin(req, res)) return;
    const { serviceAccount, sendToTokens } = require('./_push');
    if (!serviceAccount()) return res.status(400).json({ error: 'FIREBASE_SERVICE_ACCOUNT 미설정' });
    const title = String(body.title || '').trim();
    const bd = String(body.body || '').trim();
    if (!title || !bd) return res.status(400).json({ error: '제목·내용은 필수' });
    const data = { kind: 'event' }; // 탭 집계 구분용
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
    lastPlatform: row.last_platform || '',        // 마지막 접속 기기(ios/android/app/mweb/pcweb) — 신규 접속부터
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

  // 서이추 글쓰기(POST) — GET 가드 이전. 로그인+블로그 필요.
  if (req.method === 'POST' && req.query.seoichu !== undefined) {
    return handleSeoichuPost(req, res, db);
  }

  // 서이추 글 삭제(DELETE) — GET 가드 이전. 로그인+본인만.
  if (req.method === 'DELETE' && req.query.seoichu !== undefined) {
    return handleSeoichuDelete(req, res, db);
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

  // 알림 탭(앱 접근) 집계(관리자) — 최근 7일/오늘, 고유 유저 수·총 탭수, digest/event 구분
  if (req.query.push === 'openstats') {
    if (!requireAdmin(req, res)) return;
    await ensurePushTables(db);
    const row = async (sql) => (await db.execute(sql)).rows[0] || {};
    const n = (r, k) => Number(r[k] || 0);
    const w7 = await row("SELECT COUNT(*) taps, COUNT(DISTINCT user_id) users FROM push_opens WHERE created_at >= datetime('now','-7 days')");
    const today = await row("SELECT COUNT(*) taps, COUNT(DISTINCT user_id) users FROM push_opens WHERE date(created_at,'+9 hours') = date('now','+9 hours')");
    const dg = await row("SELECT COUNT(*) taps, COUNT(DISTINCT user_id) users FROM push_opens WHERE kind='digest' AND created_at >= datetime('now','-7 days')");
    const ev = await row("SELECT COUNT(*) taps, COUNT(DISTINCT user_id) users FROM push_opens WHERE kind='event' AND created_at >= datetime('now','-7 days')");
    return res.status(200).json({
      days: 7,
      taps7d: n(w7, 'taps'), users7d: n(w7, 'users'),
      tapsToday: n(today, 'taps'), usersToday: n(today, 'users'),
      digest: { taps: n(dg, 'taps'), users: n(dg, 'users') },
      event: { taps: n(ev, 'taps'), users: n(ev, 'users') },
    });
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

  // 서이추 게시판 글 목록(공개) — 블로그 등록자가 쓴 글만. 프사·닉·작성시간·작성글·블로그.
  // GET ?seoichu=1&limit=&offset=. 커뮤니티 '서이추' 세그먼트.
  if (req.query.seoichu !== undefined) {
    await ensureSeoichuTable(db);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    let rows = [];
    try {
      rows = (await db.execute({
        sql: `SELECT s.id AS id, s.content AS content, s.created_at AS created_at, s.user_id AS user_id,
                     u.nickname AS nickname, u.provider AS provider,
                     u.url_platform AS url_platform, u.url_id AS url_id, u.profile_image AS profile_image
              FROM seoichu_posts s JOIN users u ON u.id = s.user_id
              WHERE COALESCE(s.hidden,0)=0 AND u.url_id IS NOT NULL AND u.url_id <> '' AND u.url_platform IN ('블로그','인스타그램')
              ORDER BY s.created_at DESC, s.id DESC
              LIMIT ? OFFSET ?`,
        args: [limit, offset]
      })).rows;
    } catch (e) { rows = []; }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(rows.map(x => ({
      id: x.id,
      userId: x.user_id,  // 작성자 식별(클라에서 currentUser.id와 비교해 삭제버튼 노출 — 캐시 안전)
      nickname: x.nickname || '익명',
      provider: x.provider || '',
      urlPlatform: x.url_platform || '',
      urlId: x.url_id || '',
      profileImage: x.profile_image || '',
      content: x.content || '',
      createdAt: x.created_at || ''
    })));
  }

  // 전체 회원 목록(이메일 등 PII 포함)은 관리자만
  if (!requireAdmin(req, res)) return;
  // 집계용 테이블 보장(후기/접속 테이블이 아직 없을 수 있음)
  try { await db.execute("CREATE TABLE IF NOT EXISTS user_visits (user_id INTEGER NOT NULL, visit_date TEXT NOT NULL, UNIQUE(user_id, visit_date))"); } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN last_seen_at TEXT"); } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN last_platform TEXT"); } catch (e) {}
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
