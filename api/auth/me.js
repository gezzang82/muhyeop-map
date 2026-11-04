const { getDb } = require('../_db');
const { readSession, createSessionCookie } = require('./_session');

// 스키마 보장(ALTER/CREATE)은 함수 인스턴스당 1회만 — 매 호출 5~7 왕복하던 것을 콜드스타트 때만 수행(Turso/함수 비용↓).
let _schemaReady = false;
async function ensureSchema(db) {
  if (_schemaReady) return;
  for (const sql of [
    "ALTER TABLE users ADD COLUMN url_platform TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN url_id TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN last_seen_at TEXT",
    "ALTER TABLE users ADD COLUMN last_platform TEXT",
    "ALTER TABLE users ADD COLUMN profile_image TEXT",
    "CREATE TABLE IF NOT EXISTS user_visits (user_id INTEGER NOT NULL, visit_date TEXT NOT NULL, UNIQUE(user_id, visit_date))",
    "CREATE TABLE IF NOT EXISTS user_platforms (user_id INTEGER NOT NULL, platform TEXT NOT NULL, first_seen TEXT, last_seen TEXT, cnt INTEGER DEFAULT 0, PRIMARY KEY(user_id, platform))",
  ]) { try { await db.execute(sql); } catch (e) {} }
  _schemaReady = true;
}

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(200).json({ user: null });
    return;
  }

  // 로그인 유지(슬라이딩 갱신): me는 앱/페이지 로드마다 호출되므로 매 호출 세션 쿠키를 새 30일로 재발급.
  try { res.setHeader('Set-Cookie', createSessionCookie(session)); } catch (e) {}

  const db = getDb();
  await ensureSchema(db);

  // 접속 집계(경량, 매 호출): 방문일 1일 1회 + 최종접속 시각 + 마지막/누적 접속 기기.
  try { await db.execute({ sql: "INSERT OR IGNORE INTO user_visits (user_id, visit_date) VALUES (?, date('now','+9 hours'))", args: [session.userId] }); } catch (e) {}
  try { await db.execute({ sql: "UPDATE users SET last_seen_at = datetime('now') WHERE id = ?", args: [session.userId] }); } catch (e) {}
  try {
    const PLAT_OK = ['ios', 'android', 'app', 'mweb', 'pcweb'];
    const plat = PLAT_OK.includes(String(req.query.platform)) ? String(req.query.platform) : null;
    if (plat) {
      await db.execute({ sql: "UPDATE users SET last_platform = ? WHERE id = ?", args: [plat, session.userId] });
      await db.execute({ sql: "INSERT INTO user_platforms (user_id, platform, first_seen, last_seen, cnt) VALUES (?, ?, datetime('now'), datetime('now'), 1) ON CONFLICT(user_id, platform) DO UPDATE SET last_seen = datetime('now'), cnt = cnt + 1", args: [session.userId, plat] });
    }
  } catch (e) {}

  const result = await db.execute({ sql: 'SELECT email, url_platform, url_id, profile_image, created_at FROM users WHERE id = ?', args: [session.userId] });
  const row = result.rows[0] || {};

  const user = {
    id: session.userId,
    nickname: session.nickname,
    provider: session.provider,
    email: row.email || '',
    urlPlatform: row.url_platform || '',
    urlId: row.url_id || '',
    profileImage: row.profile_image || '',
    createdAt: row.created_at || '',
  };

  // 기여 통계(제보·후기·도움돼요·접속일)는 **MY/회원정보 화면 열 때만**(`?stats=1`) 계산 → 매 페이지 로드 COUNT 4개 제거.
  // 평소 refreshAuthUI는 stats 없이 호출(비용↓). 클라는 MY 열 때 me?stats=1로 채움(loadMyStats).
  if (req.query.stats !== undefined) {
    let reportCount = 0, reviewCount = 0, helpfulCount = 0, visitCount = 0;
    try { reportCount = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM campaigns WHERE user_id = ?', args: [session.userId] })).rows[0]?.n || 0); } catch (e) {}
    try { reviewCount = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?', args: [session.userId] })).rows[0]?.n || 0); } catch (e) {}
    try { helpfulCount = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM review_likes rl JOIN reviews r ON r.id = rl.review_id WHERE r.user_id = ?', args: [session.userId] })).rows[0]?.n || 0); } catch (e) {}
    try { visitCount = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM user_visits WHERE user_id = ?', args: [session.userId] })).rows[0]?.n || 0); } catch (e) {}
    user.reportCount = reportCount;
    user.reviewCount = reviewCount;
    user.helpfulCount = helpfulCount;
    user.visitCount = visitCount;
  }

  res.status(200).json({ user });
};
