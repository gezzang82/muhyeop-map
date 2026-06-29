const { getDb } = require('./_db');
const { requireAdmin } = require('./auth/_admin');

function toUser(row) {
  return {
    id: row.id,
    provider: row.provider,
    nickname: row.nickname || '',
    email: row.email || '',
    urlPlatform: row.url_platform || '',
    urlId: row.url_id || '',
    createdAt: row.created_at
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const db = getDb();

  if (req.query.leaderboard) {
    const result = await db.execute(`
      SELECT u.nickname AS nickname, COUNT(*) AS count
      FROM places p
      JOIN users u ON u.id = p.founder_user_id
      WHERE p.founder_user_id IS NOT NULL
      GROUP BY p.founder_user_id
      ORDER BY count DESC, MIN(p.created_at) ASC
      LIMIT 1
    `);
    const top = result.rows[0];
    if (!top) return res.status(200).json({ nickname: '', count: 0 });
    return res.status(200).json({ nickname: top.nickname || '', count: Number(top.count) });
  }

  // 전체 회원 목록(이메일 등 PII 포함)은 관리자만
  if (!requireAdmin(req, res)) return;
  const result = await db.execute('SELECT * FROM users ORDER BY id DESC');
  return res.status(200).json(result.rows.map(toUser));
};
