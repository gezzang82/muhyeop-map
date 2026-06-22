const { getDb } = require('../_db');
const { readSession, clearSessionCookie } = require('./_session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  try {
    const db = getDb();

    try {
      await db.execute({ sql: 'UPDATE campaigns SET user_id = NULL WHERE user_id = ?', args: [session.userId] });
    } catch (e) {}
    try {
      await db.execute({ sql: 'UPDATE places SET founder_user_id = NULL WHERE founder_user_id = ?', args: [session.userId] });
    } catch (e) {}

    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [session.userId] });

    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '탈퇴 처리 중 오류가 발생했습니다.' });
  }
};
