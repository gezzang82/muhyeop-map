const { getDb } = require('./_db');
const { requireAdmin, isAdmin } = require('./auth/_admin');

function toBanner(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    linkUrl: row.link_url || '',
    startDate: row.start_date,
    endDate: row.end_date,
    hidden: !!row.hidden,
    sortOrder: row.sort_order || 0
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
  try { await db.execute("ALTER TABLE banners ADD COLUMN hidden INTEGER DEFAULT 0"); } catch (e) {}
  try { await db.execute("ALTER TABLE banners ADD COLUMN sort_order INTEGER DEFAULT 0"); } catch (e) {} // 노출 순서(작을수록 먼저)

  if (req.method === 'GET') {
    // 공개는 숨김 배너 제외, 관리자(mh_admin)만 전체 조회(숨김 관리용). 순서: sort_order 오름차순(작을수록 먼저)
    const sql = isAdmin(req)
      ? 'SELECT * FROM banners ORDER BY sort_order ASC, id DESC'
      : 'SELECT * FROM banners WHERE COALESCE(hidden,0)=0 ORDER BY sort_order ASC, id DESC';
    const result = await db.execute(sql);
    return res.status(200).json(result.rows.map(toBanner));
  }

  // GET 외 쓰기(POST/PATCH/DELETE)는 모두 관리자만
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const { imageUrl, linkUrl, startDate, endDate } = req.body || {};
    if (!imageUrl || !startDate || !endDate) {
      return res.status(400).json({ error: 'imageUrl, startDate, endDate는 필수입니다.' });
    }
    // 새 배너는 맨 뒤로(가장 큰 sort_order+1). 지정값 오면 그대로.
    const so = (req.body || {}).sortOrder !== undefined ? Number(req.body.sortOrder) || 0
      : Number((await db.execute("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM banners")).rows[0].n);
    const result = await db.execute({
      sql: `INSERT INTO banners (image_url, link_url, start_date, end_date, sort_order) VALUES (?, ?, ?, ?, ?)`,
      args: [imageUrl, linkUrl || '', startDate, endDate, so]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, imageUrl, linkUrl: linkUrl || '', startDate, endDate, sortOrder: so });
  }

  if (req.method === 'PATCH') {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
    const b = req.body || {};
    const fields = []; const args = [];
    if (b.imageUrl !== undefined) { fields.push('image_url = ?'); args.push(b.imageUrl); }
    if (b.linkUrl !== undefined) { fields.push('link_url = ?'); args.push(b.linkUrl || ''); }
    if (b.startDate !== undefined) { fields.push('start_date = ?'); args.push(b.startDate); }
    if (b.endDate !== undefined) { fields.push('end_date = ?'); args.push(b.endDate); }
    if (b.hidden !== undefined) { fields.push('hidden = ?'); args.push(b.hidden ? 1 : 0); }
    if (b.sortOrder !== undefined) { fields.push('sort_order = ?'); args.push(Number(b.sortOrder) || 0); }
    if (!fields.length) return res.status(400).json({ error: '수정할 항목이 필요합니다.' });
    args.push(id);
    await db.execute({ sql: `UPDATE banners SET ${fields.join(', ')} WHERE id = ?`, args });
    return res.status(200).json({ id, ...b });
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    await db.execute({ sql: 'DELETE FROM banners WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
