const { getDb } = require('../_db');
const { getProvider } = require('./_provider');
const { verifyStateCookie, clearStateCookie } = require('./_state');
const { createSessionCookie } = require('./_session');
const { getBaseUrl } = require('./_http');

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

    // 세션에 담을 이메일은 DB의 유효 이메일(카카오는 OAuth 비어도 '내 정보'에서 넣은 값이 보존됨)
    let sessionEmail = profile.email || '';
    if (!sessionEmail) {
      try {
        const r = await db.execute({ sql: 'SELECT email FROM users WHERE id = ?', args: [userId] });
        sessionEmail = r.rows[0]?.email || '';
      } catch (e) {}
    }
    const sessionCookie = createSessionCookie({ userId, nickname: profile.nickname, provider: stateData.provider, email: sessionEmail });
    res.setHeader('Set-Cookie', [sessionCookie, clearStateCookie()]);
    let redirectTo = stateData.redirectTo || '/';
    if (isNewUser) {
      redirectTo += redirectTo.includes('?') ? '&signup=1' : '?signup=1';
    }
    res.writeHead(302, { Location: redirectTo });
    res.end();
  } catch (e) {
    res.status(500).send('로그인 처리 중 오류가 발생했습니다.');
  }
};
