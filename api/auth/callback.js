const crypto = require('crypto');
const { getDb } = require('../_db');
const { getProvider } = require('./_provider');
const { verifyStateCookie, clearStateCookie } = require('./_state');
const { createSessionCookie } = require('./_session');
const { getBaseUrl } = require('./_http');

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_BUNDLE_ID = 'com.muhyeop.app'; // 네이티브 Sign in with Apple의 aud(앱 번들ID)

// Apple identityToken(JWT)을 애플 공개키(JWK)로 검증하고 payload 반환
async function verifyAppleIdentityToken(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token');
  const [h, p, s] = parts;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const jwks = await fetch(APPLE_KEYS_URL).then(r => r.json());
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pubKey, Buffer.from(s, 'base64url'));
  if (!valid) throw new Error('signature verify failed');
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('bad issuer');
  if (payload.aud !== APPLE_BUNDLE_ID) throw new Error('bad audience');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('token expired');
  return payload;
}

async function ensureUsersTable(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    email TEXT DEFAULT '',
    url_platform TEXT DEFAULT '',
    url_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(provider, provider_user_id)
  )`);
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_platform TEXT DEFAULT ''");
  } catch (e) {}
  try {
    await db.execute("ALTER TABLE users ADD COLUMN url_id TEXT DEFAULT ''");
  } catch (e) {}
}

module.exports = async function handler(req, res) {
  // ===== Apple 네이티브 로그인: POST { provider:'apple', identityToken, nickname? } =====
  // 앱에서 Sign in with Apple로 받은 identityToken을 서버가 검증 → 세션 발급 (JSON 응답)
  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.provider !== 'apple') { res.status(400).json({ error: '지원하지 않는 요청입니다.' }); return; }
    try {
      const payload = await verifyAppleIdentityToken(body.identityToken);
      const providerUserId = String(payload.sub);
      const email = payload.email || '';
      const nickname = (body.nickname && String(body.nickname).trim()) || '애플사용자';
      const db = getDb();
      await ensureUsersTable(db);
      const existing = await db.execute({
        sql: 'SELECT id, nickname FROM users WHERE provider = ? AND provider_user_id = ?',
        args: ['apple', providerUserId]
      });
      let userId, isNewUser = false, finalNick;
      if (existing.rows.length) {
        userId = existing.rows[0].id;
        finalNick = existing.rows[0].nickname || nickname;
        // 재로그인: 닉네임 유지, 이메일은 애플이 준 값이 있을 때만 갱신(보통 최초에만 줌)
        await db.execute({
          sql: "UPDATE users SET email = CASE WHEN ? = '' THEN email ELSE ? END WHERE id = ?",
          args: [email, email, userId]
        });
      } else {
        isNewUser = true;
        finalNick = nickname;
        const inserted = await db.execute({
          sql: 'INSERT INTO users (provider, provider_user_id, nickname, email) VALUES (?, ?, ?, ?)',
          args: ['apple', providerUserId, nickname, email]
        });
        userId = Number(inserted.lastInsertRowid);
      }
      const sessionCookie = createSessionCookie({ userId, nickname: finalNick, provider: 'apple' });
      res.setHeader('Set-Cookie', sessionCookie);
      res.status(200).json({ ok: true, isNewUser });
    } catch (e) {
      res.status(401).json({ error: 'Apple 로그인 검증에 실패했어요.' });
    }
    return;
  }

  const { code, state } = req.query;
  const stateData = verifyStateCookie(req, state);
  if (!stateData) {
    res.status(400).send('로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.');
    return;
  }

  let p;
  try {
    p = getProvider(stateData.provider);
  } catch (e) {
    res.status(400).send(e.message);
    return;
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;

  try {
    const tokenRes = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: p.clientId(),
        client_secret: p.clientSecret() || '',
        redirect_uri: redirectUri,
        code,
        state
      })
    }).then(r => r.json());

    if (!tokenRes.access_token) {
      res.status(400).send('로그인 처리 중 오류가 발생했습니다.');
      return;
    }

    const profileRes = await fetch(p.profileUrl, {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` }
    }).then(r => r.json());
    const profile = p.parseProfile(profileRes);

    const db = getDb();
    await ensureUsersTable(db);

    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE provider = ? AND provider_user_id = ?',
      args: [stateData.provider, profile.providerUserId]
    });

    const isNewUser = !existing.rows.length;
    let userId;
    if (existing.rows.length) {
      userId = existing.rows[0].id;
      // OAuth 이메일이 비어있으면(카카오 등) 기존 email 유지 — 사용자가 '내 정보'에서 직접 넣은 이메일을 매 로그인마다 지우지 않도록
      await db.execute({
        sql: "UPDATE users SET nickname = ?, email = CASE WHEN ? = '' THEN email ELSE ? END WHERE id = ?",
        args: [profile.nickname, profile.email || '', profile.email || '', userId]
      });
    } else {
      const inserted = await db.execute({
        sql: 'INSERT INTO users (provider, provider_user_id, nickname, email) VALUES (?, ?, ?, ?)',
        args: [stateData.provider, profile.providerUserId, profile.nickname, profile.email]
      });
      userId = Number(inserted.lastInsertRowid);
    }

    // 세션 쿠키에는 email을 담지 않음(최소노출) — 제보/신고 시 userId로 DB에서 조회
    const sessionCookie = createSessionCookie({ userId, nickname: profile.nickname, provider: stateData.provider });
    res.setHeader('Set-Cookie', [sessionCookie, clearStateCookie()]);
    // 오픈 리다이렉트 방지: 같은 출처의 상대경로('/...')만 허용, '//evil.com'·절대 URL 차단
    let redirectTo = stateData.redirectTo || '/';
    if (!/^\/(?!\/)/.test(redirectTo)) redirectTo = '/';
    if (isNewUser) {
      redirectTo += redirectTo.includes('?') ? '&signup=1' : '?signup=1';
    }
    res.writeHead(302, { Location: redirectTo });
    res.end();
  } catch (e) {
    res.status(500).send('로그인 처리 중 오류가 발생했습니다.');
  }
};
