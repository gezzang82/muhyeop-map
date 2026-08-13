const { getDb } = require('./_db');
const { readSession } = require('./auth/_session');
const { isAdmin, requireAdmin } = require('./auth/_admin');
const { enforceRateLimit } = require('./_ratelimit');

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

async function ensureSiteVisitTables(db) {
  await db.execute("CREATE TABLE IF NOT EXISTS site_daily (visit_date TEXT PRIMARY KEY, pv INTEGER DEFAULT 0, uv INTEGER DEFAULT 0)");
  await db.execute("CREATE TABLE IF NOT EXISTS site_visitor (visit_date TEXT NOT NULL, visitor_key TEXT NOT NULL, PRIMARY KEY(visit_date, visitor_key))");
  await db.execute("CREATE TABLE IF NOT EXISTS site_referrer (ref TEXT PRIMARY KEY, cnt INTEGER DEFAULT 0)");
}
function kstDay() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 날짜(YYYY-MM-DD)
}
// 유입경로 분류: referrer URL → 채널 키. 빈 값=직접, 내부이동은 null(집계 제외), 주요 채널은 묶고 그 외엔 호스트명.
function classifyReferrer(ref) {
  if (!ref) return 'direct';
  let host;
  try { host = new URL(ref).hostname.toLowerCase(); } catch (e) { return 'direct'; }
  host = host.replace(/^(www\.|m\.|l\.)/, '');
  if (host === 'muhyeop.com' || host.endsWith('.muhyeop.com')) return null; // 내부 이동 제외
  if (host.includes('naver')) return 'naver';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('google')) return 'google';
  if (host.includes('daum')) return 'daum';
  if (host.includes('kakao') || host.includes('kko')) return 'kakao';
  if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('facebook') || host === 'fb.com') return 'facebook';
  if (host.includes('daangn') || host.includes('karrot')) return 'daangn';
  return host;
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

  // ===== 사이트 방문 집계 (?visit=1 기록 / ?visit=stats 조회) — 함수 12개 제한 때문에 places.js에 합침 =====
  if (req.query.visit !== undefined) {
    // 기록: 공개 페이지 로드 시 POST ?visit=1 (fire-and-forget). PV=총 방문, UV=IP+일 중복제거. fail-open.
    if (req.method === 'POST' && req.query.visit === '1') {
      try {
        await ensureSiteVisitTables(db);
        const day = kstDay();
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
        await db.execute({ sql: "INSERT INTO site_daily (visit_date, pv, uv) VALUES (?, 1, 0) ON CONFLICT(visit_date) DO UPDATE SET pv = pv + 1", args: [day] });
        const ins = await db.execute({ sql: "INSERT OR IGNORE INTO site_visitor (visit_date, visitor_key) VALUES (?, ?)", args: [day, ip] });
        if (ins.rowsAffected > 0) {
          await db.execute({ sql: "UPDATE site_daily SET uv = uv + 1 WHERE visit_date = ?", args: [day] });
        }
        const refKey = classifyReferrer(req.body && req.body.ref);
        if (refKey) {
          await db.execute({ sql: "INSERT INTO site_referrer (ref, cnt) VALUES (?, 1) ON CONFLICT(ref) DO UPDATE SET cnt = cnt + 1", args: [refKey] });
        }
      } catch (e) { /* 집계 실패는 무시 */ }
      return res.status(200).json({ ok: true });
    }
    // 조회: 어드민 대시보드 GET ?visit=stats[&period=day|week|month]
    if (req.method === 'GET' && req.query.visit === 'stats') {
      if (!requireAdmin(req, res)) return;
      try {
      await ensureSiteVisitTables(db);
      const day = kstDay();
      const today = (await db.execute({ sql: "SELECT pv, uv FROM site_daily WHERE visit_date = ?", args: [day] })).rows[0] || {};
      const total = (await db.execute("SELECT COALESCE(SUM(pv),0) AS pv, COALESCE(SUM(uv),0) AS uv FROM site_daily")).rows[0] || {};

      // 기간별 시계열: PV=SUM(pv)(site_daily), UV=COUNT(DISTINCT visitor_key)(site_visitor, 기간 내 진짜 고유)
      const period = req.query.period === 'week' ? 'week' : req.query.period === 'month' ? 'month' : 'day';
      let series;
      if (period === 'day') {
        const rows = (await db.execute("SELECT visit_date AS k, pv, uv FROM site_daily ORDER BY visit_date DESC LIMIT 14")).rows;
        series = rows.map(r => ({ label: String(r.k).slice(5), pv: Number(r.pv || 0), uv: Number(r.uv || 0) })).reverse();
      } else {
        const keyExpr = period === 'week' ? "strftime('%Y-%W', visit_date)" : "substr(visit_date,1,7)";
        const pvRows = (await db.execute(`SELECT ${keyExpr} AS k, SUM(pv) AS pv, MIN(visit_date) AS mind FROM site_daily GROUP BY k ORDER BY k DESC LIMIT 12`)).rows;
        const uvRows = (await db.execute(`SELECT ${keyExpr} AS k, COUNT(DISTINCT visitor_key) AS uv FROM site_visitor GROUP BY k`)).rows;
        const uvMap = {}; uvRows.forEach(r => { uvMap[r.k] = Number(r.uv || 0); });
        series = pvRows.map(r => ({
          label: period === 'month' ? (String(r.k).slice(5) + '월') : (String(r.mind || '').slice(5) + '~'),
          pv: Number(r.pv || 0), uv: uvMap[r.k] || 0
        })).reverse();
      }
      const refRows = (await db.execute("SELECT ref, cnt FROM site_referrer ORDER BY cnt DESC LIMIT 8")).rows;
      return res.status(200).json({
        todayPv: Number(today.pv || 0), todayUv: Number(today.uv || 0),
        totalPv: Number(total.pv || 0), totalUv: Number(total.uv || 0),
        period, series,
        referrers: refRows.map(r => ({ ref: r.ref, cnt: Number(r.cnt || 0) }))
      });
      } catch (e) {
        // 500으로 통째 실패 대신, 에러 메시지를 응답에 담아 진단 가능하게(대시보드는 빈 값으로 degrade)
        return res.status(200).json({ todayPv: 0, todayUv: 0, totalPv: 0, totalUv: 0, period: 'day', series: [], referrers: [], _error: String((e && e.message) || e) });
      }
    }
    return res.status(400).json({ error: 'visit 파라미터 오류' });
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
        clickCount: Number(row.click_count || 0),
        postDate: row.post_date || '', createdAt: row.created_at,
        hidden: !!row.hidden
      })));
    }

    // 클릭수 트래킹: POST ?reviews=track&id= (공개, 후기 카드 클릭 시 블로그로 이동하며 호출)
    if (req.method === 'POST' && action === 'track') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id 필요' });
      try {
        await db.execute({ sql: 'UPDATE reviews SET click_count = COALESCE(click_count,0) + 1 WHERE id = ?', args: [id] });
      } catch (e) { /* 트래킹 실패는 무시(fail-open) */ }
      return res.status(200).json({ ok: true });
    }

    // 목록: GET ?reviews=list&placeId=&sort=latest|likes
    if (req.method === 'GET') {
      const placeId = Number(req.query.placeId);
      if (!placeId) return res.status(400).json({ error: 'placeId가 필요합니다.' });
      // 최초제보자(매장 등록자)의 후기는 정렬과 무관하게 최상단 고정 + isFounder 뱃지
      let founderUserId = null;
      try {
        const pf = await db.execute({ sql: 'SELECT founder_user_id FROM places WHERE id = ?', args: [placeId] });
        const fv = pf.rows[0]?.founder_user_id;
        founderUserId = (fv == null) ? null : Number(fv);
      } catch (e) {}
      const baseOrder = req.query.sort === 'likes' ? 'r.like_count DESC, r.id DESC' : 'r.id DESC';
      // founderUserId는 우리 DB의 정수 PK(Number 강제)라 인라인 안전
      const order = founderUserId != null
        ? `CASE WHEN r.user_id = ${founderUserId} THEN 0 ELSE 1 END, ${baseOrder}`
        : baseOrder;
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
      return res.status(200).json(r.rows.map(row => {
        const rv = toReview(row, likedSet.has(row.id));
        rv.mine = !!(session && row.user_id != null && row.user_id === session.userId); // 본인 작성 여부(삭제 노출용)
        rv.isFounder = founderUserId != null && row.user_id != null && Number(row.user_id) === founderUserId; // 최초제보자 후기
        return rv;
      }));
    }

    // 검증(미저장 미리보기): POST ?reviews=validate { url, placeId }
    if (req.method === 'POST' && action === 'validate') {
      // 외부 블로그 fetch 남용 방지: IP당 1분에 20회
      if (!await enforceRateLimit(req, res, { name: 'review', limit: 20, windowSec: 60 })) return;
      const { url, placeId } = req.body || {};
      const pr = await db.execute({ sql: 'SELECT name FROM places WHERE id = ?', args: [Number(placeId)] });
      if (!pr.rows[0]) return res.status(404).json({ error: '매장을 찾을 수 없어요.' });
      const result = await validateAndExtract(url, pr.rows[0]?.name || '');
      return res.status(result.ok ? 200 : 400).json(result);
    }

    // 등록: POST ?reviews=create { url, placeId } (로그인 필요)
    if (req.method === 'POST' && action === 'create') {
      if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
      // 후기 등록 스팸 방지: IP당 1분에 15회
      if (!await enforceRateLimit(req, res, { name: 'review', limit: 15, windowSec: 60 })) return;
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

    // 삭제: DELETE ?reviews=1&id= (관리자 또는 작성자 본인)
    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
      if (!isAdmin(req)) {
        // 비관리자는 본인이 올린 후기만 삭제 가능
        if (!session) return res.status(401).json({ error: '로그인이 필요해요.' });
        const own = await db.execute({ sql: 'SELECT user_id FROM reviews WHERE id = ?', args: [id] });
        if (!own.rows[0]) return res.status(404).json({ error: '후기를 찾을 수 없어요.' });
        if (own.rows[0].user_id !== session.userId) return res.status(403).json({ error: '본인이 올린 후기만 삭제할 수 있어요.' });
      }
      await db.execute({ sql: 'DELETE FROM review_likes WHERE review_id = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM reviews WHERE id = ?', args: [id] });
      return res.status(200).json({ id });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method === 'GET') {
    const q = req.query || {};
    // 어드민 조회: 서버 사이드 검색/필터/페이지네이션 (수천 건+ 대응). 이메일 등 PII 포함이라 관리자만.
    if (q.admin) {
      if (!requireAdmin(req, res)) return;
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
    // 공개 지도 조회: 숨김 매장 제외 + 이메일(PII) 제외하고 반환
    const result = await db.execute('SELECT * FROM places WHERE COALESCE(hidden,0)=0');
    return res.status(200).json(result.rows.map(r => { const p = toPlace(r); delete p.founderEmail; return p; }));
  }

  if (req.method === 'POST') {
    // 매장 제보 스팸 방지: IP당 1분에 15회
    if (!await enforceRateLimit(req, res, { name: 'write', limit: 15, windowSec: 60 })) return;
    const { name, address, lat, lng, category, founderUrl } = req.body || {};
    if (!name || !address || lat == null || lng == null || !category) {
      return res.status(400).json({ error: 'name, address, lat, lng, category는 필수입니다.' });
    }
    // 어드민 등록(source='admin')은 운영자가 대신 입력하는 것이므로 로그인 세션을 최초 제보자로 기록하지 않음
    const session = (req.body?.source === 'admin') ? null : readSession(req);
    const founderNickname = session ? session.nickname : (req.body?.founderNickname || '');
    // 이메일은 로그인 사용자만 DB에서 조회해 저장(비로그인은 수집하지 않음 — 타인 이메일 임의 저장 방지)
    let finalFounderEmail = '';
    if (session) {
      try { const er = await db.execute({ sql: 'SELECT email FROM users WHERE id = ?', args: [session.userId] }); finalFounderEmail = er.rows[0]?.email || ''; } catch (_e) {}
    }
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
