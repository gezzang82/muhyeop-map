// 어드민 인증 헬퍼 — 사용자 세션과 동일한 HMAC(SESSION_SECRET) 방식의 별도 쿠키.
// 비밀번호는 process.env.ADMIN_PASSWORD(서버 전용)와 비교. 함수 카운트 제외(_ 접두).
const crypto = require('crypto');
const { sign, parseCookies } = require('./_session');

const COOKIE_NAME = 'mh_admin';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30일

function createAdminCookie() {
  const payloadB64 = Buffer.from(JSON.stringify({ admin: true, exp: Date.now() + MAX_AGE_SECONDS * 1000 })).toString('base64url');
  const sig = sign(payloadB64);
  return `${COOKIE_NAME}=${payloadB64}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

function clearAdminCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function isAdmin(req) {
  const raw = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!raw) return false;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return false;
  const payloadB64 = raw.slice(0, dot);
  const sigGiven = raw.slice(dot + 1);
  let expected;
  try { expected = sign(payloadB64); } catch (e) { return false; }
  if (sigGiven.length !== expected.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sigGiven), Buffer.from(expected))) return false;
  } catch (e) { return false; }
  try {
    const p = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return p.admin === true && typeof p.exp === 'number' && p.exp > Date.now();
  } catch (e) { return false; }
}

// 비밀번호 검증 (타이밍 안전)
function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false; // 미설정이면 항상 실패(잠금)
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

// 쓰기/민감 API 게이트
function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  return false;
}

module.exports = { createAdminCookie, clearAdminCookie, isAdmin, checkPassword, requireAdmin };
