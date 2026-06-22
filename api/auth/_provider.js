const PROVIDERS = {
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    clientId: () => process.env.KAKAO_CLIENT_ID,
    clientSecret: () => process.env.KAKAO_CLIENT_SECRET,
    parseProfile: (json) => ({
      providerUserId: String(json.id),
      nickname: json.kakao_account?.profile?.nickname || '',
      email: json.kakao_account?.email || ''
    })
  },
  naver: {
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    profileUrl: 'https://openapi.naver.com/v1/nid/me',
    clientId: () => process.env.NAVER_CLIENT_ID,
    clientSecret: () => process.env.NAVER_CLIENT_SECRET,
    parseProfile: (json) => ({
      providerUserId: json.response?.id,
      nickname: json.response?.nickname || '',
      email: json.response?.email || ''
    })
  }
};

function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`지원하지 않는 provider: ${name}`);
  return p;
}

module.exports = { getProvider };
