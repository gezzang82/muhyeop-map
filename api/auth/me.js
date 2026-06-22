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

  const result = await db.execute({ sql: 'SELECT email, url_platform, url_id FROM users WHERE id = ?', args: [session.userId] });
  const row = result.rows[0] || {};

  res.status(200).json({
    user: {
      id: session.userId,
      nickname: session.nickname,
      provider: session.provider,
      email: row.email || '',
      urlPlatform: row.url_platform || '',
      urlId: row.url_id || ''
    }
  });
};
