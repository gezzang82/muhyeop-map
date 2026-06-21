const { getDb } = require('./_db');

function toReport(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    placeId: row.place_id,
    reason: row.reason,
    detail: row.detail || '',
    createdAt: row.created_at,
    placeName: row.place_name || '',
    platform: row.platform || '',
    content: row.content || ''
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    reason TEXT NOT NULL,
    detail TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN hidden INTEGER DEFAULT 0");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }

  if (req.method === 'GET') {
    const result = await db.execute(`
      SELECT r.*, c.platform AS platform, c.content AS content, p.id AS place_id, p.name AS place_name
      FROM reports r
      JOIN campaigns c ON c.id = r.campaign_id
      JOIN places p ON p.id = c.place_id
      ORDER BY r.id DESC
    `);
    return res.status(200).json(result.rows.map(toReport));
  }

  if (req.method === 'POST') {
    const { campaignId, reason, detail } = req.body || {};
    if (!campaignId || !reason) {
      return res.status(400).json({ error: 'campaignId, reason은 필수입니다.' });
    }
    const result = await db.execute({
      sql: `INSERT INTO reports (campaign_id, reason, detail) VALUES (?, ?, ?)`,
      args: [campaignId, reason, detail || '']
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, campaignId, reason, detail: detail || '' });
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    await db.execute({ sql: 'DELETE FROM reports WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
