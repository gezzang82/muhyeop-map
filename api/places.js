const { getDb } = require('./_db');
const { readSession } = require('./auth/_session');
const { isAdmin, requireAdmin } = require('./auth/_admin');

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

  // ===== 후기(리뷰) 라우팅 — 함수 12개 제한 때문에 places.js에 합침 (?reviews=...) =====
  if (req.query.reviews !== undefined) {
    const { validateAndExtract, ensureReviewTables, toReview } = require('./_reviews');
    await ensureReviewTables(db);
    const action = req.query.reviews;
    const session = readSession(req);

    // 어드민 전체 목록: GET ?reviews=all (숨김 포함, 매장명/작성자 조인)
    if (req.method === 'GET' && action === 'all') {
      if (!requireAdmin(req, res)) return;
      const r = await db.execute(`
        SELECT r.*, p.name AS place_name,
               COALESCE(NULLIF(u.nickname,''),
                 (SELECT u2.nickname FROM users u2 WHERE u2.url_platform='블로그' AND u2.url_id=r.blog_id AND NULLIF(u2.nickname,'') IS NOT NULL ORDER BY u2.id DESC LIMIT 1)
               ) AS user_nickname
        FROM reviews r
        LEFT JOIN places p ON p.id = r.place_id
        LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.id DESC`);
      return res.status(200).json(r.rows.map(row => ({
        id: row.id, placeId: row.place_id, placeName: row.place_name || '',
        url: row.url, title: row.title || '블로그 후기',
        author: row.user_nickname || row.author || '',
        likeCount: Number(row.like_count || 0),
        postDate: row.post_date || '', createdAt: row.created_at,
        hidden: !!row.hidden
      })));
    }

    // 목록: GET ?reviews=list&placeId=&sort=latest|likes
    if (req.method === 'GET') {
      const placeId = Number(req.query.placeId);
      if (!placeId) return res.status(400).json({ error: 'placeId가 필요합니다.' });
      const order = req.query.sort === 'likes' ? 'r.like_count DESC, r.id DESC' : 'r.id DESC';
      const r = await db.execute({
        sql: `SELECT r.*,
                     COALESCE(
                       NULLIF(u.nickname, ''),
                       (
                         SELECT u2.nickname
                         FROM users u2
                         WHERE u2.url_platform = '블로그'
                           AND u2.url_id = r.blog_id
                           AND NULLIF(u2.nickname, '') IS NOT NULL
                         ORDER BY u2.id DESC
                         LIMIT 1
                       )
                     ) AS user_nickname
              FROM reviews r
              LEFT JOIN users u ON u.id = r.user_id
              WHERE r.place_id = ? AND COALESCE(r.hidden,0)=0
              ORDER BY ${order}`,
        args: [placeId]
      });
      let likedSet = new Set();
      if (session && r.rows.length) {
        const ids = r.rows.map(x => x.id);
        const lk = await db.execute({ sql: `SELECT review_id FROM review_likes WHERE voter_key = ? AND review_id IN (${ids.map(() => '?').join(',')})`, args: ['u' + session.userId, ...ids] });
        likedSet = new Set(lk.rows.map(x => x.review_id));
      }
      return res.status(200).json(r.rows.map(row => toReview(row, likedSet.has(row.id))));
    }

    // 검증(미저장 미리보기): POST ?reviews=validate { url, placeId }
    if (req.method === 'POST' && action === 'validate') {
      const { url, placeId } = req.body || {};
      const pr = await db.execute({ sql: 'SELECT name FROM places WHERE id = ?', args: [Number(placeId)] });
      if (!pr.rows[0]) return res.status(404).json({ error: '매장을 찾을 수 없어요.' });
      const result = await validateAndExtract(url, pr.rows[0]?.name || '');
      return res.status(result.ok ? 200 : 400).json(result);
    }

    // 등록: POST ?reviews=create { url, placeId } (로그인 필요)
    if (req.method === 'POST' && action === 'create') {
      if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
      const { url, placeId } = req.body || {};
      const pid = Number(placeId);
      const pr = await db.execute({ sql: 'SELECT name FROM places WHERE id = ?', args: [pid] });
      if (!pr.rows[0]) return res.status(404).json({ error: '매장을 찾을 수 없어요.' });
      const result = await validateAndExtract(url, pr.rows[0].name);
      if (!result.ok) return res.status(400).json(result);
      const d = result.data;
      const dup = await db.execute({ sql: 'SELECT id FROM reviews WHERE place_id = ? AND log_no = ? AND COALESCE(hidden,0)=0', args: [pid, d.logNo] });
      if (dup.rows.length) return res.status(409).json({ error: '이미 등록된 후기예요.' });
      const ins = await db.execute({
        sql: `INSERT INTO reviews (place_id, url, blog_id, log_no, title, thumbnail, excerpt, author, user_id, post_date) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        args: [pid, d.url, d.blogId, d.logNo, d.title, d.thumbnail, d.excerpt, session.nickname || d.author, session.userId, d.postDate || '']
      });
      const row = (await db.execute({ sql: 'SELECT * FROM reviews WHERE id = ?', args: [Number(ins.lastInsertRowid)] })).rows[0];
      return res.status(201).json(toReview(row, false));
    }

    // 좋아요 토글: POST ?reviews=like&id= (로그인 필요)
    if (req.method === 'POST' && action === 'like') {
      if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
      const review = await db.execute({ sql: 'SELECT id FROM reviews WHERE id = ? AND COALESCE(hidden,0)=0', args: [id] });
      if (!review.rows[0]) return res.status(404).json({ error: '후기를 찾을 수 없어요.' });
      const voterKey = 'u' + session.userId;
      const existing = await db.execute({ sql: 'SELECT 1 FROM review_likes WHERE review_id = ? AND voter_key = ?', args: [id, voterKey] });
      let liked;
      if (existing.rows.length) {
        await db.execute({ sql: 'DELETE FROM review_likes WHERE review_id = ? AND voter_key = ?', args: [id, voterKey] });
        await db.execute({ sql: 'UPDATE reviews SET like_count = MAX(0, COALESCE(like_count,0) - 1) WHERE id = ?', args: [id] });
        liked = false;
      } else {
        await db.execute({ sql: 'INSERT OR IGNORE INTO review_likes (review_id, voter_key) VALUES (?, ?)', args: [id, voterKey] });
        await db.execute({ sql: 'UPDATE reviews SET like_count = COALESCE(like_count,0) + 1 WHERE id = ?', args: [id] });
        liked = true;
      }
      const row = (await db.execute({ sql: 'SELECT like_count FROM reviews WHERE id = ?', args: [id] })).rows[0];
      return res.status(200).json({ liked, likeCount: Number(row?.like_count || 0) });
    }

    // 숨김 토글: PATCH ?reviews=&id= { hidden } (관리자)
    if (req.method === 'PATCH') {
      if (!requireAdmin(req, res)) return;
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
      const hidden = (req.body || {}).hidden ? 1 : 0;
      await db.execute({ sql: 'UPDATE reviews SET hidden = ? WHERE id = ?', args: [hidden, id] });
      return res.status(200).json({ id, hidden: !!hidden });
    }

    // 삭제: DELETE ?reviews=1&id= (관리자)
    if (req.method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
      await db.execute({ sql: 'DELETE FROM review_likes WHERE review_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM reviews WHERE id = ?', args: [id] });
      return res.status(200).json({ id });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method === 'GET') {
    const q = req.query || {};
    // 어드민 조회: 서버 사이드 검색/필터/페이지네이션 (수천 건+ 대응)
    if (q.admin) {
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const size = Math.min(500, Math.max(1, parseInt(q.size, 10) || 100));
      const where = []; const args = [];
      const today = new Date().toISOString().slice(0, 10);
      // 진행 중(노출) 캠페인 존재 여부: 숨김 안 됨 + 마감일 없음 또는 오늘 이후
      const activeSub = `EXISTS (SELECT 1 FROM campaigns c WHERE c.place_id = p.id AND COALESCE(c.hidden,0)=0 AND (c.deadline='' OR c.deadline IS NULL OR c.deadline >= ?))`;
      if (q.q) { where.push('p.name LIKE ?'); args.push('%' + q.q + '%'); }
      if (q.category && q.category !== 'all') { where.push('p.category = ?'); args.push(q.category); }
      // 상태 3분류: visible(노출=진행중 캠페인 있음) / expired(마감=진행중 캠페인 없음) / hidden(강제 숨김)
      if (q.status === 'visible') { where.push('COALESCE(p.hidden,0) = 0'); where.push(activeSub); args.push(today); }
      else if (q.status === 'expired') { where.push('COALESCE(p.hidden,0) = 0'); where.push('NOT ' + activeSub); args.push(today); }
      else if (q.status === 'hidden') { where.push('COALESCE(p.hidden,0) = 1'); }
      if (q.reporter) { where.push('(p.founder_nickname LIKE ? OR p.founder_email LIKE ?)'); args.push('%' + q.reporter + '%', '%' + q.reporter + '%'); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
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
    // 어드민 등록(source='admin')은 운영자가 대신 입력하는 것이므로 로그인 세션을 최초 제보자로 기록하지 않음
    const session = (req.body?.source === 'admin') ? null : readSession(req);
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
    // 비관리자는 category 보정만 허용(공개 제보용). name/address/hidden 변경은 관리자만.
    if (!isAdmin(req) && (name !== undefined || address !== undefined || hidden !== undefined)) {
      return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
    }
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
    if (!requireAdmin(req, res)) return;
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
