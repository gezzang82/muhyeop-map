const { getDb } = require('./_db');

function toPlace(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    category: row.category,
    founderNickname: row.founder_nickname || '',
    founderEmail: row.founder_email || '',
    founderUrl: row.founder_url || ''
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();

  if (req.method === 'GET') {
    const result = await db.execute('SELECT * FROM places');
    return res.status(200).json(result.rows.map(toPlace));
  }

  if (req.method === 'POST') {
    const { name, address, lat, lng, category, founderNickname, founderEmail, founderUrl } = req.body || {};
    if (!name || !address || lat == null || lng == null || !category) {
      return res.status(400).json({ error: 'name, address, lat, lng, category는 필수입니다.' });
    }
    const result = await db.execute({
      sql: `INSERT INTO places (name, address, lat, lng, category, founder_nickname, founder_email, founder_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name, address, lat, lng, category, founderNickname || '', founderEmail || '', founderUrl || '']
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, name, address, lat, lng, category, founderNickname: founderNickname || '', founderEmail: founderEmail || '', founderUrl: founderUrl || '' });
  }

  if (req.method === 'PATCH') {
    const id = Number(req.query.id);
    const { category } = req.body || {};
    if (!id || !category) {
      return res.status(400).json({ error: 'id, category는 필수입니다.' });
    }
    await db.execute({ sql: 'UPDATE places SET category = ? WHERE id = ?', args: [category, id] });
    return res.status(200).json({ id, category });
  }

  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
