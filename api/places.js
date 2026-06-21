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
    founderUrl: row.founder_url || '',
    hidden: !!row.hidden
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  try {
    await db.execute("ALTER TABLE places ADD COLUMN hidden INTEGER DEFAULT 0");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }

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
    const { name, address, category, lat, lng, hidden } = req.body || {};
    if (!id || (!name && !address && !category && hidden === undefined)) {
      return res.status(400).json({ error: 'id와 수정할 항목(name, address, category, hidden 중 하나 이상)이 필요합니다.' });
    }
    const fields = [];
    const args = [];
    if (name) { fields.push('name = ?'); args.push(name); }
    if (category) { fields.push('category = ?'); args.push(category); }
    if (address) {
      fields.push('address = ?'); args.push(address);
      if (lat != null && lng != null) { fields.push('lat = ?', 'lng = ?'); args.push(lat, lng); }
    }
    if (hidden !== undefined) { fields.push('hidden = ?'); args.push(hidden ? 1 : 0); }
    args.push(id);
    await db.execute({ sql: `UPDATE places SET ${fields.join(', ')} WHERE id = ?`, args });
    return res.status(200).json({ id, name, address, category, lat, lng, hidden });
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    await db.execute({ sql: 'DELETE FROM campaigns WHERE place_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM places WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
