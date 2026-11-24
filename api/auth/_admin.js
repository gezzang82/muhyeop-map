// 어드민 인증 헬퍼 — 사용자 세션과 동일한 HMAC(SESSION_SECRET) 방식의 별도 쿠키.
// 비밀번호는 process.env.ADMIN_PASSWORD(서버 전용)와 비교. 함수 카운트 제외(_ 접두).
const crypto = require('crypto');
const { sign, parseCookies, readSession } = require('./_session');

const COOKIE_NAME = 'mh_admin';
// 운영자(개짜장) user_id — 어드민 비밀번호 없이도 '읽기 전용 집계'(대시보드)만 허용할 세션 유저.
//  방문/알림탭 집계 제외 ID(EXCLUDED_USER_IDS)와 같은 운영자 계정. 쓰기/PII는 열지 않음(아래 requireAdminOrOperator 적용처 참고).
const OPERATOR_USER_IDS = (process.env.OPERATOR_USER_IDS || '12')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
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

// 운영자 로그인 세션(OAuth user_id ∈ OPERATOR_USER_IDS)인지. 어드민 쿠키와 무관.
function isOperatorSession(req) {
  try {
    const s = readSession(req);
    return !!(s && OPERATOR_USER_IDS.includes(Number(s.userId)));
  } catch (e) { return false; }
}

// 읽기 전용 집계(앱 내 운영자 대시보드)용 게이트 — 어드민이거나 운영자 세션이면 통과.
//  ⚠️ 집계/카운트 응답에만 쓸 것. 회원 전체목록(PII)·상세조회엔 절대 쓰지 말 것(requireAdmin 유지).
function requireAdminOrOperator(req, res) {
  if (isAdmin(req) || isOperatorSession(req)) return true;
  res.status(401).json({ error: '권한이 필요합니다.' });
  return false;
}

module.exports = { createAdminCookie, clearAdminCookie, isAdmin, checkPassword, requireAdmin, isOperatorSession, requireAdminOrOperator };
