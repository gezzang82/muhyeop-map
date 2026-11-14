const { getDb } = require('./_db');
const { requireAdmin, isAdmin } = require('./auth/_admin');

// 클릭 집계에서 운영자 본인 제외(방문/캠페인 트래킹과 동일 집IP)
const EXCLUDED_TRACK_IPS = new Set(
  ['119.67.74.173'].concat(String(process.env.EXCLUDED_VISIT_IPS || '').split(','))
    .map(s => s.trim()).filter(Boolean)
);

function toBanner(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    linkUrl: row.link_url || '',
    startDate: row.start_date,
    endDate: row.end_date,
    hidden: !!row.hidden,
    sortOrder: row.sort_order || 0,
    noticeId: row.notice_id || null,   // 연결된 이벤트·공지(있으면 팝업 탭 시 그 상세로 이동)
    clickCount: row.click_count || 0   // 팝업 탭(클릭) 누적
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();

  // ===== 광고 구좌 배너(ad_banners): 홈 리스트 / 후기 피드 구좌. 구좌당 여러 개 로테이션 =====
  //  (함수 12개 제한으로 banners.js에 ?ad= 분기로 합침). 클릭은 배너별 click_count 누적(운영자 집IP 제외).
  if (req.query.ad !== undefined) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ad_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slot TEXT NOT NULL, image_url TEXT, link_url TEXT,
      enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')))`);
    // 구좌별 노출 방식: random(접속마다 1개 랜덤)·single(1개 고정)·multiple(정렬 순서대로 플립 자동순환)
    await db.execute(`CREATE TABLE IF NOT EXISTS ad_slot_config (slot TEXT PRIMARY KEY, mode TEXT DEFAULT 'random')`);
    try { await db.execute("ALTER TABLE ad_banners ADD COLUMN view_count INTEGER DEFAULT 0"); } catch (e) {}  // 노출(세션당 유니크) 집계 → CTR
    const toAd = r => ({ id: r.id, slot: r.slot, imageUrl: r.image_url, linkUrl: r.link_url || '', enabled: !!r.enabled, sortOrder: r.sort_order || 0, clickCount: r.click_count || 0, viewCount: r.view_count || 0 });
    const getModes = async () => { const m = { home: 'random', feed: 'random' }; try { (await db.execute("SELECT slot, mode FROM ad_slot_config")).rows.forEach(r => { if (r.mode) m[r.slot] = r.mode; }); } catch (e) {} return m; };

    // 공개: 배너 클릭 집계(운영자 집IP 제외)
    if (req.method === 'POST' && req.query.ad === 'click') {
      const id = Number(req.query.id); if (!id) return res.status(400).json({ error: 'id required' });
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (EXCLUDED_TRACK_IPS.has(ip)) return res.status(200).json({ ok: true, excluded: true });
      try { await db.execute({ sql: "UPDATE ad_banners SET click_count = COALESCE(click_count,0)+1 WHERE id=?", args: [id] }); } catch (e) {}
      return res.status(200).json({ ok: true });
    }
    // 공개: 배너 노출 집계(운영자 집IP 제외). 클라가 세션당 배너별 1회만 전송(IntersectionObserver) → view_count=유니크 세션 노출.
    if (req.method === 'POST' && req.query.ad === 'view') {
      const id = Number(req.query.id); if (!id) return res.status(400).json({ error: 'id required' });
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (EXCLUDED_TRACK_IPS.has(ip)) return res.status(200).json({ ok: true, excluded: true });
      try { await db.execute({ sql: "UPDATE ad_banners SET view_count = COALESCE(view_count,0)+1 WHERE id=?", args: [id] }); } catch (e) {}
      return res.status(200).json({ ok: true });
    }
    // GET: 공개(enabled만, 구좌별 그룹) / 어드민(?admin=1, 전체+클릭/노출수)
    if (req.method === 'GET') {
      const modes = await getModes();
      if (req.query.admin === '1') {
        if (!requireAdmin(req, res)) return;
        const all = (await db.execute("SELECT * FROM ad_banners ORDER BY slot, sort_order ASC, id ASC")).rows.map(toAd);
        return res.status(200).json({ banners: all, modes });
      }
      const rows = (await db.execute("SELECT id, slot, image_url, link_url FROM ad_banners WHERE enabled=1 ORDER BY slot, sort_order ASC, id ASC")).rows;
      const out = { home: { mode: modes.home, items: [] }, feed: { mode: modes.feed, items: [] } };
      rows.forEach(r => { (out[r.slot] = out[r.slot] || { mode: modes[r.slot] || 'random', items: [] }).items.push({ id: r.id, imageUrl: r.image_url, linkUrl: r.link_url || '' }); });
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
      return res.status(200).json(out);
    }
    // 쓰기는 관리자만
    if (!requireAdmin(req, res)) return;
    // 구좌 노출 방식 설정
    if (req.method === 'POST' && req.query.ad === 'mode') {
      const b = req.body || {};
      const slot = String(b.slot || '').trim(), mode = String(b.mode || '').trim();
      if (!['home', 'feed'].includes(slot)) return res.status(400).json({ error: 'slot(home|feed) 필수' });
      if (!['random', 'single', 'multiple'].includes(mode)) return res.status(400).json({ error: 'mode(random|single|multiple)' });
      await db.execute({ sql: "INSERT INTO ad_slot_config (slot, mode) VALUES (?,?) ON CONFLICT(slot) DO UPDATE SET mode=excluded.mode", args: [slot, mode] });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST' && req.query.ad === 'add') {
      const b = req.body || {};
      const slot = String(b.slot || '').trim();
      if (!['home', 'feed'].includes(slot)) return res.status(400).json({ error: 'slot(home|feed) 필수' });
      if (!b.imageUrl) return res.status(400).json({ error: '이미지 필수' });
      const so = Number(((await db.execute({ sql: "SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM ad_banners WHERE slot=?", args: [slot] })).rows[0] || {}).n || 0);
      await db.execute({ sql: "INSERT INTO ad_banners (slot, image_url, link_url, enabled, sort_order) VALUES (?,?,?,1,?)", args: [slot, b.imageUrl, String(b.linkUrl || ''), so] });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'PATCH') {
      const id = Number(req.query.id); if (!id) return res.status(400).json({ error: 'id required' });
      const b = req.body || {}; const sets = [], args = [];
      if (b.linkUrl !== undefined) { sets.push('link_url=?'); args.push(String(b.linkUrl || '')); }
      if (b.enabled !== undefined) { sets.push('enabled=?'); args.push(b.enabled ? 1 : 0); }
      if (b.sortOrder !== undefined) { sets.push('sort_order=?'); args.push(Number(b.sortOrder) || 0); }
      if (b.imageUrl !== undefined && b.imageUrl) { sets.push('image_url=?'); args.push(b.imageUrl); }
      if (!sets.length) return res.status(400).json({ error: '변경할 값 없음' });
      args.push(id);
      await db.execute({ sql: `UPDATE ad_banners SET ${sets.join(', ')} WHERE id=?`, args });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const id = Number(req.query.id); if (!id) return res.status(400).json({ error: 'id required' });
      await db.execute({ sql: "DELETE FROM ad_banners WHERE id=?", args: [id] });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'unknown ad action' });
  }

  // 공개: 인스타 자동발행용 이미지 서빙. IG Graph API는 '공개 이미지 URL'만 받으므로,
  // 생성한 카드 PNG를 ig_assets에 base64로 저장해두고 이 URL(?asset=<id>)로 서빙한다.
  // (함수 12개 제한 때문에 새 파일 대신 banners.js에 분기로 합침)
  if (req.method === 'GET' && req.query.asset) {
    try {
      await db.execute(`CREATE TABLE IF NOT EXISTS ig_assets (id TEXT PRIMARY KEY, mime TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now')))`);
      const r = await db.execute({ sql: 'SELECT mime, data FROM ig_assets WHERE id=?', args: [String(req.query.asset)] });
      if (!r.rows.length) return res.status(404).json({ error: 'not found' });
      const buf = Buffer.from(r.rows[0].data, 'base64');
      res.setHeader('Content-Type', r.rows[0].mime || 'image/png');
      // 'story-latest'는 매일 덮어써지므로 캐시 금지(최신 보장). 나머지(고정 id 카드)는 장기 캐시.
      res.setHeader('Cache-Control', String(req.query.asset) === 'story-latest' ? 'no-store, max-age=0' : 'public, s-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).send(buf);
    } catch (e) { return res.status(500).json({ error: 'asset error' }); }
  }

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
  try { await db.execute("ALTER TABLE banners ADD COLUMN notice_id INTEGER"); } catch (e) {} // 연결된 이벤트·공지 id
  try { await db.execute("ALTER TABLE banners ADD COLUMN click_count INTEGER DEFAULT 0"); } catch (e) {} // 팝업 탭(클릭) 집계

  // 공개: 배너(이벤트 팝업) 클릭 트래킹 — POST ?track=click&id= (운영자 IP 제외, 단순 누적)
  if (req.method === 'POST' && req.query.track === 'click') {
    const id = Number(req.query.id); if (!id) return res.status(400).json({ error: 'id required' });
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    if (EXCLUDED_TRACK_IPS.has(ip)) return res.status(200).json({ ok: true, excluded: true });
    try { await db.execute({ sql: "UPDATE banners SET click_count = COALESCE(click_count,0)+1 WHERE id=?", args: [id] }); } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    // 공개는 숨김 배너 제외, 관리자(mh_admin)만 전체 조회(숨김 관리용). 순서: sort_order 오름차순(작을수록 먼저)
    const admin = isAdmin(req);
    const wantAdmin = req.query.admin === '1'; // 어드민은 ?admin=1 별도 URL로 조회 → CDN 캐시키 분리(캐시 미적용)
    const sql = admin
      ? 'SELECT * FROM banners ORDER BY sort_order ASC, id DESC'
      : 'SELECT * FROM banners WHERE COALESCE(hidden,0)=0 ORDER BY sort_order ASC, id DESC';
    const result = await db.execute(sql);
    // 공개 GET만 짧은 엣지 캐시: 배너는 자주 안 바뀌고 payload가 큼(이미지 data URI). 이벤트 팝업이
    // 빨리 뜨게 CDN 히트(~0.3s)로. ⚠️ Vercel CDN은 쿠키를 구분 안 해 같은 URL은 어드민에게도 캐시된 공개응답을
    // 주므로, 어드민은 반드시 ?admin=1(별도 캐시키)로 조회하고 그 응답은 캐시하지 않는다(항상 라이브·숨김 포함).
    if (!admin && !wantAdmin) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
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
    const noticeId = (req.body || {}).noticeId || null;
    const result = await db.execute({
      sql: `INSERT INTO banners (image_url, link_url, start_date, end_date, sort_order, notice_id) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [imageUrl, linkUrl || '', startDate, endDate, so, noticeId ? Number(noticeId) : null]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({ id, imageUrl, linkUrl: linkUrl || '', startDate, endDate, sortOrder: so, noticeId: noticeId ? Number(noticeId) : null });
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
    if (b.noticeId !== undefined) { fields.push('notice_id = ?'); args.push(b.noticeId ? Number(b.noticeId) : null); }
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
