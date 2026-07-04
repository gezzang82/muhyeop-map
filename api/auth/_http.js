// OAuth redirect_uri 등에 쓰는 서비스 표준 베이스 URL.
// Host 헤더 스푸핑 방지를 위해 PUBLIC_BASE_URL 환경변수를 우선 사용하고,
// 미설정 시에만 요청 헤더 기반으로 폴백(배포만으로 기존 동작이 깨지지 않도록).
function getBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

module.exports = { getBaseUrl };
