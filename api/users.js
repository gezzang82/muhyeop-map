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
  return res.status(400).json({ error: 'unknown push action' });
}

function toUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    nickname: row.nickname || '',
    email: row.email || '',
    urlPlatform: row.url_platform || '',
    urlId: row.url_id || '',
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

  // 앱 푸시 토큰/관심위치 등록(공개, 기기 단위) — GET 전용 가드보다 먼저.
  if (req.method === 'POST' && req.query.push) {
    return handlePushPost(req, res, db, req.query.push);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
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
