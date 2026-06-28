const { getDb } = require('../_db');
const { readSession, createSessionCookie } = require('./_session');

const URL_PLATFORM_DOMAINS = { '블로그': 'blog.naver.com/', '인스타그램': 'instagram.com/' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { urlPlatform, urlId, email } = req.body || {};
  if (urlPlatform && !URL_PLATFORM_DOMAINS[urlPlatform]) {
    res.status(400).json({ error: '지원하지 않는 링크 플랫폼입니다.' });
    return;
  }
  const finalEmail = String(email || '').trim();
  if (finalEmail && !EMAIL_RE.test(finalEmail)) {
    res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    return;
  }

  const db = getDb();
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_platform TEXT DEFAULT ''");
  } catch (e) {}
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_id TEXT DEFAULT ''");
  } catch (e) {}

  const finalPlatform = urlPlatform && urlId ? urlPlatform : '';
  const finalId = urlPlatform && urlId ? String(urlId).trim() : '';

  await db.execute({
    sql: 'UPDATE users SET url_platform = ?, url_id = ?, email = ? WHERE id = ?',
    args: [finalPlatform, finalId, finalEmail, session.userId]
  });

  // 세션 쿠키의 email도 갱신 → 이후 제보/신고 시 founder_email/reporter_email 자동입력이 따라옴
  // (특히 카카오는 OAuth 이메일이 비어 세션에 없었음)
  res.setHeader('Set-Cookie', createSessionCookie({
    userId: session.userId, nickname: session.nickname, provider: session.provider, email: finalEmail
  }));
  res.status(200).json({ ok: true, urlPlatform: finalPlatform, urlId: finalId, email: finalEmail });
};
