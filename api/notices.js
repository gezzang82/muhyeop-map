const { getDb } = require('./_db');
const { requireAdmin, isAdmin } = require('./auth/_admin');

// 이벤트/공지 — 한 테이블(type로 구분), 피드형 목록 + 상세. banners(이벤트 팝업)와 별개의 '콘텐츠 허브'.
function toNotice(row) {
  return {
    id: row.id,
    type: row.type || 'notice',            // 'notice'(공지) | 'event'(이벤트)
    title: row.title || '',
    body: row.body || '',
    imageUrl: row.image_url || '',          // 대표 이미지(선택)
    linkUrl: row.link_url || '',            // 외부 CTA(선택)
    periodStart: row.period_start || '',    // 이벤트 기간(선택)
    periodEnd: row.period_end || '',
    pinned: !!row.pinned,
    hidden: !!row.hidden,
    publishedAt: row.published_at || row.created_at || '',
    createdAt: row.created_at || ''
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'notice',
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    link_url TEXT DEFAULT '',
    period_start TEXT DEFAULT '',
    period_end TEXT DEFAULT '',
    pinned INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    published_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  if (req.method === 'GET') {
    const admin = isAdmin(req);
    const wantAdmin = req.query.admin === '1'; // 어드민은 별도 캐시키(미캐시)

    // 상세: ?id=
    if (req.query.id) {
      const id = Number(req.query.id);
      const r = await db.execute({ sql: 'SELECT * FROM notices WHERE id = ?', args: [id] });
      if (!r.rows.length) return res.status(404).json({ error: 'not found' });
      const n = r.rows[0];
      if (!admin && n.hidden) return res.status(404).json({ error: 'not found' }); // 숨김은 실제 관리자만(쿠키). ?admin=1만으론 접근 불가
      if (!admin && !wantAdmin) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
      return res.status(200).json(toNotice(n));
    }

    // 목록: 숨김 포함은 실제 관리자(mh_admin 쿠키)만. ?admin=1은 캐시키 분리(미캐시)용일 뿐 필터 권한 아님.
    const sql = admin
      ? 'SELECT * FROM notices ORDER BY pinned DESC, published_at DESC, id DESC'
      : 'SELECT * FROM notices WHERE COALESCE(hidden,0)=0 ORDER BY pinned DESC, published_at DESC, id DESC';
    const result = await db.execute(sql);
    if (!admin && !wantAdmin) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return res.status(200).json(result.rows.map(toNotice));
  }

  // 쓰기는 관리자만
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'title은 필수입니다.' });
    const type = (b.type === 'event') ? 'event' : 'notice';
    const result = await db.execute({
      sql: `INSERT INTO notices (type, title, body, image_url, link_url, period_start, period_end, pinned, hidden, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(NULLIF(?,''), datetime('now')))`,
      args: [type, b.title, b.body || '', b.imageUrl || '', b.linkUrl || '', b.periodStart || '', b.periodEnd || '',
             b.pinned ? 1 : 0, b.hidden ? 1 : 0, b.publishedAt || '']
    });
    const id = Number(result.lastInsertRowid);
    const r = await db.execute({ sql: 'SELECT * FROM notices WHERE id = ?', args: [id] });
    return res.status(201).json(toNotice(r.rows[0]));
  }

  if (req.method === 'PATCH') {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
    const b = req.body || {};
    const fields = []; const args = [];
    const map = { type: 'type', title: 'title', body: 'body', imageUrl: 'image_url', linkUrl: 'link_url', periodStart: 'period_start', periodEnd: 'period_end', publishedAt: 'published_at' };
    for (const [k, col] of Object.entries(map)) { if (b[k] !== undefined) { fields.push(`${col} = ?`); args.push(k === 'type' ? (b[k] === 'event' ? 'event' : 'notice') : (b[k] || '')); } }
    if (b.pinned !== undefined) { fields.push('pinned = ?'); args.push(b.pinned ? 1 : 0); }
    if (b.hidden !== undefined) { fields.push('hidden = ?'); args.push(b.hidden ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: '수정할 항목이 필요합니다.' });
    args.push(id);
    await db.execute({ sql: `UPDATE notices SET ${fields.join(', ')} WHERE id = ?`, args });
    const r = await db.execute({ sql: 'SELECT * FROM notices WHERE id = ?', args: [id] });
    return res.status(200).json(toNotice(r.rows[0]));
  }

  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
    await db.execute({ sql: 'DELETE FROM notices WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
