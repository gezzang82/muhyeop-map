const { getProvider } = require('./_provider');
const { createStateCookie } = require('./_state');
const { getBaseUrl } = require('./_http');
const { createAdminCookie, checkPassword } = require('./_admin');
const { enforceRateLimit } = require('../_ratelimit');

module.exports = async function handler(req, res) {
  // 어드민 로그인: POST /api/auth/login?admin=1  { password }
  if (req.method === 'POST' && req.query.admin === '1') {
    // 브루트포스 방지: IP당 5분에 8회
    if (!await enforceRateLimit(req, res, { name: 'adminlogin', limit: 8, windowSec: 300 })) return;
    const password = (req.body && req.body.password) || '';
    if (!process.env.ADMIN_PASSWORD) {
      res.status(503).json({ error: '어드민 로그인이 아직 설정되지 않았습니다.' });
      return;
    }
    if (!checkPassword(password)) {
      res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
      return;
    }
    res.setHeader('Set-Cookie', createAdminCookie());
    res.status(200).json({ ok: true });
    return;
  }

  const provider = req.query.provider;
  const redirectTo = req.query.redirectTo || '/';

  let p;
  try {
    p = getProvider(provider);
  } catch (e) {
    res.status(400).send(e.message);
    return;
  }

  if (!p.clientId()) {
    res.status(503).send('로그인 기능이 아직 설정되지 않았습니다.');
    return;
  }

  try {
    const { state, cookie } = createStateCookie({ provider, redirectTo });
    const redirectUri = `${getBaseUrl(req)}/api/auth/callback`;

    const url = new URL(p.authorizeUrl);
    url.searchParams.set('client_id', p.clientId());
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);

    res.setHeader('Set-Cookie', cookie);
    res.writeHead(302, { Location: url.toString() });
    res.end();
  } catch (e) {
    res.status(500).send('로그인 처리 중 오류가 발생했습니다.');
  }
};
