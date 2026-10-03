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
  // 전달된 필드만 갱신(부분 업데이트) — MY 페이지에서 profileImage만 보내도 SNS/이메일이 지워지지 않게.
  const hasUrl = Object.prototype.hasOwnProperty.call(body, 'urlPlatform') || Object.prototype.hasOwnProperty.call(body, 'urlId');
  const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
  const hasImage = Object.prototype.hasOwnProperty.call(body, 'profileImage');

  let finalPlatform = '', finalId = '', finalEmail = '', finalImage = '';
  if (hasUrl) {
    const { urlPlatform, urlId } = body;
    if (urlPlatform && !URL_PLATFORM_DOMAINS[urlPlatform]) {
      res.status(400).json({ error: '지원하지 않는 링크 플랫폼입니다.' });
      return;
    }
    finalPlatform = urlPlatform && urlId ? urlPlatform : '';
    // 블로그(네이버)·인스타 ID는 소문자만 유효 → 대문자로 입력해도 링크가 열리도록 소문자 정규화
    finalId = urlPlatform && urlId ? String(urlId).trim().toLowerCase() : '';
  }
  if (hasEmail) {
    finalEmail = String(body.email || '').trim();
    if (finalEmail && !EMAIL_RE.test(finalEmail)) {
      res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
      return;
    }
  }
  // 프로필 이미지(선택): 데이터 URI만, 리사이즈된 작은 이미지 전제(≤300KB). 빈 문자열이면 제거.
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

  const sets = [], args = [];
  if (hasUrl) { sets.push('url_platform = ?', 'url_id = ?'); args.push(finalPlatform, finalId); }
  if (hasEmail) { sets.push('email = ?'); args.push(finalEmail); }
  if (hasImage) { sets.push('profile_image = ?'); args.push(finalImage); }
  if (sets.length) {
    args.push(session.userId);
    await db.execute({ sql: `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args });
  }

  // email은 users 테이블에만 저장(위 UPDATE). 세션 쿠키에는 담지 않음 → 제보/신고 시 userId로 DB 조회
  res.setHeader('Set-Cookie', createSessionCookie({
    userId: session.userId, nickname: session.nickname, provider: session.provider
  }));
  const out = { ok: true };
  if (hasUrl) { out.urlPlatform = finalPlatform; out.urlId = finalId; }
  if (hasEmail) out.email = finalEmail;
  if (hasImage) out.profileImage = finalImage;
  res.status(200).json(out);
};
