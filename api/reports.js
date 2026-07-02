const { getDb } = require('./_db');
const { readSession } = require('./auth/_session');
const { requireAdmin } = require('./auth/_admin');

const TARGET_TYPES = ['place', 'campaign', 'review'];

function toReport(row) {
  return {
    id: row.id,
    targetType: row.target_type || 'campaign',
    campaignId: row.campaign_id,
    placeId: row.place_id,
    reviewId: row.review_id,
    reason: row.reason,
    detail: row.detail || '',
    createdAt: row.created_at,
    placeName: row.place_name || '(삭제됨)',
    platform: row.platform || '',
    content: row.content || '',
    reviewTitle: row.review_title || '',
    reporterNickname: row.reporter_nickname || ''
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  // 신규 스키마: 매장/캠페인/후기 3종 신고 (campaign_id/place_id/review_id 모두 nullable)
  await db.execute(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL DEFAULT 'campaign',
    campaign_id INTEGER,
    place_id INTEGER,
    review_id INTEGER,
    reason TEXT NOT NULL,
    detail TEXT DEFAULT '',
    user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // 기존 테이블(캠페인 전용)에서 넘어온 경우 컬럼 점진 추가
  for (const sql of [
    "ALTER TABLE reports ADD COLUMN target_type TEXT DEFAULT 'campaign'",
    "ALTER TABLE reports ADD COLUMN place_id INTEGER",
    "ALTER TABLE reports ADD COLUMN review_id INTEGER",
    "ALTER TABLE reports ADD COLUMN user_id INTEGER"
  ]) {
    try { await db.execute(sql); } catch (e) { /* 이미 있으면 무시 */ }
  }
  try { await db.execute("ALTER TABLE campaigns ADD COLUMN hidden INTEGER DEFAULT 0"); } catch (e) {}

  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const result = await db.execute(`
      SELECT r.*,
             c.platform AS platform, c.content AS content,
             COALESCE(pp.name, cp.name, rp.name) AS place_name,
             rv.title AS review_title,
             u.nickname AS reporter_nickname
      FROM reports r
      LEFT JOIN campaigns c ON c.id = r.campaign_id
      LEFT JOIN places cp ON cp.id = c.place_id
      LEFT JOIN places pp ON pp.id = r.place_id
      LEFT JOIN reviews rv ON rv.id = r.review_id
      LEFT JOIN places rp ON rp.id = rv.place_id
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.id DESC
    `);
    return res.status(200).json(result.rows.map(toReport));
  }

  if (req.method === 'POST') {
    const { targetType, campaignId, placeId, reviewId, reason, detail } = req.body || {};
    const type = TARGET_TYPES.includes(targetType) ? targetType : 'campaign';
    if (!reason) return res.status(400).json({ error: 'reason은 필수입니다.' });
    let cid = null, pid = null, rid = null;
    if (type === 'campaign') { if (!campaignId) return res.status(400).json({ error: 'campaignId가 필요합니다.' }); cid = Number(campaignId); }
    else if (type === 'place') { if (!placeId) return res.status(400).json({ error: 'placeId가 필요합니다.' }); pid = Number(placeId); }
    else if (type === 'review') { if (!reviewId) return res.status(400).json({ error: 'reviewId가 필요합니다.' }); rid = Number(reviewId); }

    const session = readSession(req);
    const userId = session ? session.userId : null;
    const result = await db.execute({
      sql: `INSERT INTO reports (target_type, campaign_id, place_id, review_id, reason, detail, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [type, cid, pid, rid, reason, detail || '', userId]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, targetType: type, campaignId: cid, placeId: pid, reviewId: rid, reason, detail: detail || '' });
  }

  if (req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
    await db.execute({ sql: 'DELETE FROM reports WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
