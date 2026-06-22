const { readSession } = require('./_session');

module.exports = async function handler(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(200).json({ user: null });
    return;
  }
  res.status(200).json({
    user: { id: session.userId, nickname: session.nickname, provider: session.provider }
  });
};
