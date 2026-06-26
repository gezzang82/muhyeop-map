const { getDb } = require('./_db');
const { readSession } = require('./auth/_session');

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
  try {
    await db.execute("ALTER TABLE places ADD COLUMN founder_user_id INTEGER REFERENCES users(id)");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }

  if (req.method === 'GET') {
    const q = req.query || {};
    // 어드민 조회: 서버 사이드 검색/필터/페이지네이션 (수천 건+ 대응)
    if (q.admin) {
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const size = Math.min(500, Math.max(1, parseInt(q.size, 10) || 100));
      const where = []; const args = [];
      if (q.q) { where.push('p.name LIKE ?'); args.push('%' + q.q + '%'); }
      if (q.category && q.category !== 'all') { where.push('p.category = ?'); args.push(q.category); }
      if (q.status === 'visible') where.push('COALESCE(p.hidden,0) = 0');
      else if (q.status === 'hidden') where.push('COALESCE(p.hidden,0) = 1');
      if (q.reporter) { where.push('(p.founder_nickname LIKE ? OR p.founder_email LIKE ?)'); args.push('%' + q.reporter + '%', '%' + q.reporter + '%'); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const today = new Date().toISOString().slice(0, 10);
      const totalRes = await db.execute({ sql: `SELECT COUNT(*) AS n FROM places p ${whereSql}`, args });
      const total = Number(totalRes.rows[0]?.n || 0);
      const rowsRes = await db.execute({
        sql: `SELECT p.*, (SELECT COUNT(*) FROM campaigns c WHERE c.place_id = p.id AND COALESCE(c.hidden,0)=0 AND (c.deadline='' OR c.deadline IS NULL OR c.deadline>=?)) AS active_count
              FROM places p ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
        args: [today, ...args, size, (page - 1) * size]
      });
      const rows = rowsRes.rows.map(r => ({ ...toPlace(r), activeCount: Number(r.active_count || 0) }));
      return res.status(200).json({ rows, total, page, size });
    }
    const result = await db.execute('SELECT * FROM places');
    return res.status(200).json(result.rows.map(toPlace));
  }

  if (req.method === 'POST') {
    const { name, address, lat, lng, category, founderEmail, founderUrl } = req.body || {};
    if (!name || !address || lat == null || lng == null || !category) {
      return res.status(400).json({ error: 'name, address, lat, lng, category는 필수입니다.' });
    }
    const session = readSession(req);
    const founderNickname = session ? session.nickname : (req.body?.founderNickname || '');
    const finalFounderEmail = session ? (session.email || '') : (founderEmail || '');
    const founderUserId = session ? session.userId : null;
    const result = await db.execute({
      sql: `INSERT INTO places (name, address, lat, lng, category, founder_nickname, founder_email, founder_url, founder_user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name, address, lat, lng, category, founderNickname || '', finalFounderEmail, founderUrl || '', founderUserId]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, name, address, lat, lng, category, founderNickname: founderNickname || '', founderEmail: finalFounderEmail, founderUrl: founderUrl || '' });
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
