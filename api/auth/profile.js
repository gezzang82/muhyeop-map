const { getDb } = require('../_db');
const { readSession } = require('./_session');

const URL_PLATFORM_DOMAINS = { '블로그': 'blog.naver.com/', '인스타그램': 'instagram.com/' };

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

  const { urlPlatform, urlId } = req.body || {};
  if (urlPlatform && !URL_PLATFORM_DOMAINS[urlPlatform]) {
    res.status(400).json({ error: '지원하지 않는 링크 플랫폼입니다.' });
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
    sql: 'UPDATE users SET url_platform = ?, url_id = ? WHERE id = ?',
    args: [finalPlatform, finalId, session.userId]
  });

  res.status(200).json({ ok: true, urlPlatform: finalPlatform, urlId: finalId });
};
