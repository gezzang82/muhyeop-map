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

    // 탈퇴 로그(이탈 분석용, PII 최소: 닉네임/이메일 미기록). 삭제 '직전'에 비식별 메타만 적재.
    try {
      await db.execute(`CREATE TABLE IF NOT EXISTS deleted_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orig_user_id INTEGER,
        provider TEXT,
        signup_source TEXT,
        last_platform TEXT,
        signup_date TEXT,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      const u = (await db.execute({
        sql: "SELECT provider, signup_source, last_platform, date(created_at,'+9 hours') AS signup_date FROM users WHERE id = ?",
        args: [session.userId],
      })).rows[0];
      if (u) {
        const body = req.body || {};
        const reason = (typeof body.reason === 'string' ? body.reason : '').slice(0, 40) || null;
        await db.execute({
          sql: 'INSERT INTO deleted_users (orig_user_id, provider, signup_source, last_platform, signup_date, reason) VALUES (?,?,?,?,?,?)',
          args: [session.userId, u.provider || null, u.signup_source || null, u.last_platform || null, u.signup_date || null, reason],
        });
      }
    } catch (e) {}

    try {
      await db.execute({ sql: 'UPDATE campaigns SET user_id = NULL WHERE user_id = ?', args: [session.userId] });
    } catch (e) {}
    try {
      await db.execute({ sql: 'UPDATE places SET founder_user_id = NULL WHERE founder_user_id = ?', args: [session.userId] });
    } catch (e) {}
    // 후기: 작성자 계정과의 연결만 해제(블로그 필명 표기는 유지), 좋아요 기록은 삭제
    try {
      await db.execute({ sql: 'UPDATE reviews SET user_id = NULL WHERE user_id = ?', args: [session.userId] });
    } catch (e) {}
    try {
      await db.execute({ sql: 'DELETE FROM review_likes WHERE voter_key = ?', args: ['u' + session.userId] });
    } catch (e) {}

    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [session.userId] });

    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '탈퇴 처리 중 오류가 발생했습니다.' });
  }
};
