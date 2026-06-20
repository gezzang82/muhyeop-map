const { getDb } = require('./_db');

function toBanner(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    linkUrl: row.link_url || '',
    startDate: row.start_date,
    endDate: row.end_date
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    link_url TEXT DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  if (req.method === 'GET') {
    const result = await db.execute('SELECT * FROM banners ORDER BY id DESC');
    return res.status(200).json(result.rows.map(toBanner));
  }

  if (req.method === 'POST') {
    const { imageUrl, linkUrl, startDate, endDate } = req.body || {};
    if (!imageUrl || !startDate || !endDate) {
      return res.status(400).json({ error: 'imageUrl, startDate, endDate는 필수입니다.' });
    }
    const result = await db.execute({
      sql: `INSERT INTO banners (image_url, link_url, start_date, end_date) VALUES (?, ?, ?, ?)`,
      args: [imageUrl, linkUrl || '', startDate, endDate]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, imageUrl, linkUrl: linkUrl || '', startDate, endDate });
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    await db.execute({ sql: 'DELETE FROM banners WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
