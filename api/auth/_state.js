const crypto = require('crypto');
const { sign, timingSafeEqualStr, parseCookies } = require('./_session');

const COOKIE_NAME = 'mhm_oauth_state';
const MAX_AGE_SECONDS = 10 * 60;

function createStateCookie({ provider, redirectTo }) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const payload = { nonce, provider, redirectTo: redirectTo || '/' };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64);
  const cookie = `${COOKIE_NAME}=${payloadB64}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
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
