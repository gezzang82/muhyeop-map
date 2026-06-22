const { getProvider } = require('./_provider');
const { createStateCookie } = require('./_state');
const { getBaseUrl } = require('./_http');

module.exports = async function handler(req, res) {
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
