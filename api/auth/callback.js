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

    let userId;
    if (existing.rows.length) {
      userId = existing.rows[0].id;
      await db.execute({
        sql: 'UPDATE users SET nickname = ?, email = ? WHERE id = ?',
        args: [profile.nickname, profile.email, userId]
      });
    } else {
      const inserted = await db.execute({
        sql: 'INSERT INTO users (provider, provider_user_id, nickname, email) VALUES (?, ?, ?, ?)',
        args: [stateData.provider, profile.providerUserId, profile.nickname, profile.email]
      });
      userId = Number(inserted.lastInsertRowid);
    }

    const sessionCookie = createSessionCookie({ userId, nickname: profile.nickname, provider: stateData.provider, email: profile.email });
    res.setHeader('Set-Cookie', [sessionCookie, clearStateCookie()]);
    res.writeHead(302, { Location: stateData.redirectTo || '/' });
    res.end();
  } catch (e) {
    res.status(500).send('로그인 처리 중 오류가 발생했습니다.');
  }
};
