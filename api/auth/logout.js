const { clearSessionCookie } = require('./_session');
const { clearAdminCookie } = require('./_admin');

module.exports = async function handler(req, res) {
  // 사용자 세션 + 어드민 쿠키 모두 정리
  res.setHeader('Set-Cookie', [clearSessionCookie(), clearAdminCookie()]);
  res.status(200).json({ ok: true });
};
