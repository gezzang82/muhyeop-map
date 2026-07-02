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
    createdAt: row.created_at,
    reportCount: Number(row.report_count || 0),   // 협찬 제보수(캠페인)
    reviewCount: Number(row.review_count || 0),   // 후기 등록수
    visitCount: Number(row.visit_count || 0)      // 접속수(1일 1회)
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
  // 집계용 테이블 보장(후기/접속 테이블이 아직 없을 수 있음)
  try { await db.execute("CREATE TABLE IF NOT EXISTS user_visits (user_id INTEGER NOT NULL, visit_date TEXT NOT NULL, UNIQUE(user_id, visit_date))"); } catch (e) {}
  const result = await db.execute(`
    SELECT u.*,
      (SELECT COUNT(*) FROM campaigns c WHERE c.user_id = u.id) AS report_count,
      (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id) AS review_count,
      (SELECT COUNT(*) FROM user_visits v WHERE v.user_id = u.id) AS visit_count
    FROM users u ORDER BY u.id DESC`);
  return res.status(200).json(result.rows.map(toUser));
};
