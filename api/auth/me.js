const { getDb } = require('../_db');
const { readSession } = require('./_session');

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(200).json({ user: null });
    return;
  }

  const db = getDb();
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_platform TEXT DEFAULT ''");
  } catch (e) {}
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_id TEXT DEFAULT ''");
  } catch (e) {}

  // 접속수 집계: 로그인 사용자 1일 1회 기록 (KST 날짜 기준, UNIQUE로 중복 제거)
  try {
    await db.execute("CREATE TABLE IF NOT EXISTS user_visits (user_id INTEGER NOT NULL, visit_date TEXT NOT NULL, UNIQUE(user_id, visit_date))");
    await db.execute({ sql: "INSERT OR IGNORE INTO user_visits (user_id, visit_date) VALUES (?, date('now','+9 hours'))", args: [session.userId] });
  } catch (e) {}

  const result = await db.execute({ sql: 'SELECT email, url_platform, url_id, created_at FROM users WHERE id = ?', args: [session.userId] });
  const row = result.rows[0] || {};

  let reportCount = 0;
  try {
    const cnt = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM campaigns WHERE user_id = ?', args: [session.userId] });
    reportCount = Number(cnt.rows[0]?.n || 0);
  } catch (e) {}

  res.status(200).json({
    user: {
      id: session.userId,
      nickname: session.nickname,
      provider: session.provider,
      email: row.email || '',
      urlPlatform: row.url_platform || '',
      urlId: row.url_id || '',
      createdAt: row.created_at || '',
      reportCount
    }
  });
};
