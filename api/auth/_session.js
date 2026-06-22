const crypto = require('crypto');

const COOKIE_NAME = 'mhm_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sign(payloadB64) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다');
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(header) {
  return Object.fromEntries(
    header.split(';').filter(Boolean).map(kv => {
      const idx = kv.indexOf('=');
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  );
}

function createSessionCookie({ userId, nickname, provider }) {
  const payload = { userId, nickname, provider, exp: Date.now() + MAX_AGE_SECONDS * 1000 };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64);
  return `${COOKIE_NAME}=${payloadB64}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readSession(req) {
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
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

module.exports = {
  sign,
  timingSafeEqualStr,
  parseCookies,
  createSessionCookie,
  clearSessionCookie,
  readSession
};
