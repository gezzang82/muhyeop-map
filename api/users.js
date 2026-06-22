const { getDb } = require('./_db');

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
  const result = await db.execute('SELECT * FROM users ORDER BY id DESC');
  return res.status(200).json(result.rows.map(toUser));
};
