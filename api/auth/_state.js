const crypto = require('crypto');
const { sign, timingSafeEqualStr, parseCookies } = require('./_session');

const COOKIE_NAME = 'mhm_oauth_state';
const MAX_AGE_SECONDS = 10 * 60;

function createStateCookie({ provider, redirectTo, sameSiteNone, src }) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const cleanSrc = src ? String(src).toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) : '';
  const payload = { nonce, provider, redirectTo: redirectTo || '/', src: cleanSrc };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64);
  // Apple 웹 로그인은 form_post로 다른 도메인(appleid.apple.com)에서 POST로 돌아와 SameSite=Lax 쿠키가
  // 안 실려옴 → Apple만 SameSite=None(Secure 필수)로 발급.
  const sameSite = sameSiteNone ? 'None' : 'Lax';
  const cookie = `${COOKIE_NAME}=${payloadB64}.${sig}; HttpOnly; Secure; SameSite=${sameSite}; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
  return { state: nonce, cookie };
}

function clearStateCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function verifyStateCookie(req, stateFromQuery) {
  const raw = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!raw) return null;
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const payloadB64 = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  let expected;
  try {
    expected = sign(payloadB64);
  } catch {
    return null;
  }
  if (!timingSafeEqualStr(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    return null;
  }
  if (!stateFromQuery || !timingSafeEqualStr(payload.nonce, stateFromQuery)) return null;
  return payload;
}

module.exports = { createStateCookie, clearStateCookie, verifyStateCookie };
