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

  const body = req.body || {};
  const { urlPlatform, urlId, email } = body;
  if (urlPlatform && !URL_PLATFORM_DOMAINS[urlPlatform]) {
    res.status(400).json({ error: '지원하지 않는 링크 플랫폼입니다.' });
    return;
  }
  const finalEmail = String(email || '').trim();
  if (finalEmail && !EMAIL_RE.test(finalEmail)) {
    res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    return;
  }
  // 프로필 이미지(선택): 데이터 URI만, 리사이즈된 작은 이미지 전제(≤300KB). 빈 문자열이면 제거.
  const hasImage = Object.prototype.hasOwnProperty.call(body, 'profileImage');
  let finalImage = '';
  if (hasImage) {
    finalImage = String(body.profileImage || '');
    if (finalImage && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(finalImage)) {
      res.status(400).json({ error: '이미지 형식이 올바르지 않습니다.' });
      return;
    }
    if (finalImage.length > 300000) {
      res.status(400).json({ error: '이미지 용량이 너무 커요.' });
      return;
    }
  }

  const db = getDb();
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_platform TEXT DEFAULT ''");
  } catch (e) {}
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_id TEXT DEFAULT ''");
  } catch (e) {}
  try { await db.execute("ALTER TABLE users ADD COLUMN profile_image TEXT"); } catch (e) {}

  const finalPlatform = urlPlatform && urlId ? urlPlatform : '';
  // 블로그(네이버)·인스타 ID는 소문자만 유효 → 대문자로 입력해도 링크가 열리도록 소문자 정규화
  const finalId = urlPlatform && urlId ? String(urlId).trim().toLowerCase() : '';

  await db.execute({
    sql: 'UPDATE users SET url_platform = ?, url_id = ?, email = ? WHERE id = ?',
    args: [finalPlatform, finalId, finalEmail, session.userId]
  });
  // 프로필 이미지는 전송된 경우에만 갱신(폼에 안 넣고 저장해도 기존 이미지 보존)
  if (hasImage) {
    await db.execute({ sql: 'UPDATE users SET profile_image = ? WHERE id = ?', args: [finalImage, session.userId] });
  }

  // email은 users 테이블에만 저장(위 UPDATE). 세션 쿠키에는 담지 않음 → 제보/신고 시 userId로 DB 조회
  res.setHeader('Set-Cookie', createSessionCookie({
    userId: session.userId, nickname: session.nickname, provider: session.provider
  }));
  res.status(200).json(Object.assign({ ok: true, urlPlatform: finalPlatform, urlId: finalId, email: finalEmail }, hasImage ? { profileImage: finalImage } : {}));
};
