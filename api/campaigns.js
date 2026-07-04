const { getDb } = require('./_db');
const { readSession } = require('./auth/_session');
const { requireAdmin } = require('./auth/_admin');
const { runScrape, reparsePending } = require('./_scrape');
const { enforceRateLimit } = require('./_ratelimit');

function toCampaign(row) {
  return {
    id: row.id,
    placeId: row.place_id,
    platform: row.platform,
    channels: JSON.parse(row.channels || '[]'),
    content: row.content,
    deadline: row.deadline,
    link: row.link || '',
    operatingDays: JSON.parse(row.operating_days || '[]'),
    operatingHours: row.operating_hours || '',
    excludeHoliday: !!row.exclude_holiday,
    reporterNickname: row.reporter_nickname || '',
    reporterEmail: row.reporter_email || '',
    reporterBlog: row.reporter_blog || '',
    reporterInstagram: row.reporter_instagram || '',
    reporterUrl: row.reporter_url || '',
    source: row.source || 'unknown',
    hidden: !!row.hidden,
    viewCount: row.view_count || 0,
    clickCount: row.click_count || 0,
    createdAt: row.created_at
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN source TEXT DEFAULT 'unknown'");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN hidden INTEGER DEFAULT 0");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN user_id INTEGER REFERENCES users(id)");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }
  // 조회/클릭수 누적 (표시는 나중, 카운트는 지금부터 — 소급 불가)
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN view_count INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN click_count INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS campaign_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      visitor_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(campaign_id, kind, visitor_key)
    )`);
  } catch (e) {}
  // 데이터수집(Phase 1) 스테이징 테이블
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS scraped_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL, source_id INTEGER, source_url TEXT,
      name TEXT, address TEXT, category TEXT, channel TEXT, content TEXT, deadline TEXT,
      hours TEXT, days TEXT, exclude_holiday INTEGER DEFAULT 0,
      flags TEXT, dedupe_status TEXT, matched_place_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending', created_campaign_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','+9 hours')), reviewed_at TEXT,
      UNIQUE(platform, source_id)
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS scrape_state (
      platform TEXT PRIMARY KEY, last_max_id INTEGER, last_run_at TEXT
    )`);
    await db.execute(`CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL,
      run_at TEXT DEFAULT (datetime('now','+9 hours')),
      cursor_from INTEGER, cursor_to INTEGER, fetched INTEGER, staged INTEGER, excluded INTEGER, note TEXT
    )`);
  } catch (e) {}

  // ===== 데이터수집(Phase 1): ?action=scrape|staged|runs|review (모두 관리자 전용) =====
  const action = req.query.action;
  if (action) {
    if (!requireAdmin(req, res)) return;
    if (action === 'scrape' && req.method === 'POST') {
      const platform = req.query.platform || 'dinnerqueen';
      const mode = req.query.mode === 'all-seoul' ? 'all-seoul' : 'jeonche';
      const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 40));
      try {
        const summary = await runScrape({ db, platform, mode, limit });
        return res.status(200).json(summary);
      } catch (e) {
        return res.status(500).json({ error: '수집 실패: ' + (e.message || e) });
      }
    }
    if (action === 'reparse' && req.method === 'POST') {
      const platform = req.query.platform || 'dinnerqueen';
      try {
        const summary = await reparsePending({ db, platform, only: req.query.only });
        return res.status(200).json(summary);
      } catch (e) {
        return res.status(500).json({ error: '재파싱 실패: ' + (e.message || e) });
      }
    }
    if (action === 'staged' && req.method === 'GET') {
      const status = req.query.status || 'pending';
      const args = [];
      let sql = 'SELECT * FROM scraped_items';
      const where = [];
      if (status !== 'all') { where.push('status = ?'); args.push(status); }
      if (req.query.platform) { where.push('platform = ?'); args.push(req.query.platform); }
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      sql += ' ORDER BY id DESC LIMIT 500';
      const r = await db.execute({ sql, args });
      return res.status(200).json(r.rows);
    }
    if (action === 'runs' && req.method === 'GET') {
      const r = await db.execute('SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 50');
      return res.status(200).json(r.rows);
    }
    if (action === 'review' && req.method === 'PATCH') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
      const { status, createdCampaignId } = req.body || {};
      if (!['pending', 'approved', 'rejected', 'registered'].includes(status)) {
        return res.status(400).json({ error: 'status 값이 올바르지 않습니다.' });
      }
      await db.execute({
        sql: `UPDATE scraped_items SET status = ?, created_campaign_id = ?, reviewed_at = datetime('now','+9 hours') WHERE id = ?`,
        args: [status, createdCampaignId || null, id],
      });
      return res.status(200).json({ id, status });
    }
    if (action === 'editstaged' && req.method === 'PATCH') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
      const b = req.body || {};
      const sets = []; const args = [];
      for (const f of ['name', 'address', 'category', 'channel', 'content', 'deadline', 'hours', 'days']) {
        if (b[f] !== undefined) { sets.push(`${f} = ?`); args.push(String(b[f])); }
      }
      if (b.excludeHoliday !== undefined) { sets.push('exclude_holiday = ?'); args.push(b.excludeHoliday ? 1 : 0); }
      if (!sets.length) return res.status(200).json({ id });
      args.push(id);
      await db.execute({ sql: `UPDATE scraped_items SET ${sets.join(', ')} WHERE id = ?`, args });
      return res.status(200).json({ id });
    }
    return res.status(400).json({ error: '지원하지 않는 action/method' });
  }

  // 조회/클릭 트래킹: POST /api/campaigns?track=view|click&id=123 (IP+일자 기준 중복 제거)
  if (req.method === 'POST' && (req.query.track === 'view' || req.query.track === 'click')) {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'id는 필수입니다.' });
    const kind = req.query.track;
    const col = kind === 'click' ? 'click_count' : 'view_count';
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const day = new Date().toISOString().slice(0, 10);
    const visitorKey = `${ip}|${day}`;
    try {
      const ins = await db.execute({
        sql: 'INSERT OR IGNORE INTO campaign_events (campaign_id, kind, visitor_key) VALUES (?, ?, ?)',
        args: [id, kind, visitorKey]
      });
      if (ins.rowsAffected > 0) {
        await db.execute({ sql: `UPDATE campaigns SET ${col} = COALESCE(${col}, 0) + 1 WHERE id = ?`, args: [id] });
      }
    } catch (e) {}
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const q = req.query || {};
    // 어드민 조회: 서버 사이드 검색/필터/페이지네이션 (수천 건+ 대응). 이메일 등 PII 포함이라 관리자만.
    if (q.admin) {
      if (!requireAdmin(req, res)) return;
      const page = Math.max(1, parseInt(q.page, 10) || 1);
      const size = Math.min(500, Math.max(1, parseInt(q.size, 10) || 100));
      const where = []; const args = [];
      if (q.q) { where.push('pl.name LIKE ?'); args.push('%' + q.q + '%'); }
      if (q.platform && q.platform !== 'all') { where.push('c.platform = ?'); args.push(q.platform); }
      if (q.channel && q.channel !== 'all') { where.push('c.channels LIKE ?'); args.push('%"' + q.channel + '"%'); }
      if (q.reporter) { where.push('(c.reporter_nickname LIKE ? OR c.reporter_email LIKE ?)'); args.push('%' + q.reporter + '%', '%' + q.reporter + '%'); }
      if (q.source === 'user') where.push("c.source = 'user'");
      else if (q.source === 'admin') where.push("c.source = 'admin'");
      const today = new Date().toISOString().slice(0, 10);
      if (q.status === 'active') { where.push("(c.deadline='' OR c.deadline IS NULL OR c.deadline >= ?)"); args.push(today); }
      else if (q.status === 'expired') { where.push("(c.deadline != '' AND c.deadline IS NOT NULL AND c.deadline < ?)"); args.push(today); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const totalRes = await db.execute({ sql: `SELECT COUNT(*) AS n FROM campaigns c LEFT JOIN places pl ON pl.id = c.place_id ${whereSql}`, args });
      const total = Number(totalRes.rows[0]?.n || 0);
      const rowsRes = await db.execute({
        sql: `SELECT c.*, pl.name AS place_name FROM campaigns c LEFT JOIN places pl ON pl.id = c.place_id ${whereSql} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
        args: [...args, size, (page - 1) * size]
      });
      const rows = rowsRes.rows.map(r => ({ ...toCampaign(r), placeName: r.place_name || '' }));
      return res.status(200).json({ rows, total, page, size });
    }
    // 공개 지도 조회: 숨김 캠페인 + 숨김 매장 소속 캠페인 제외, 이메일(PII) 제외하고 반환
    const result = await db.execute(`
      SELECT c.* FROM campaigns c
      LEFT JOIN places p ON p.id = c.place_id
      WHERE COALESCE(c.hidden,0)=0 AND COALESCE(p.hidden,0)=0`);
    return res.status(200).json(result.rows.map(r => { const c = toCampaign(r); delete c.reporterEmail; return c; }));
  }

  if (req.method === 'POST') {
    // 제보 스팸 방지: IP당 1분에 15회
    if (!await enforceRateLimit(req, res, { name: 'write', limit: 15, windowSec: 60 })) return;
    const {
      placeId, platform, channels, content, deadline, link,
      operatingDays, operatingHours, excludeHoliday,
      reporterBlog, reporterInstagram, reporterUrl, source
    } = req.body || {};
    if (!placeId || !platform || !content || !channels?.length) {
      return res.status(400).json({ error: 'placeId, platform, content, channels는 필수입니다.' });
    }
    // 어드민 등록(source='admin')은 운영자가 대신 입력하는 것이므로 로그인 세션을 제보자로 기록하지 않음
    const session = (source === 'admin') ? null : readSession(req);
    const reporterNickname = session ? session.nickname : (req.body?.reporterNickname || '');
    // 이메일은 로그인 사용자만 DB에서 조회해 저장(비로그인은 수집하지 않음 — 타인 이메일 임의 저장 방지)
    let reporterEmail = '';
    if (session) {
      try { const er = await db.execute({ sql: 'SELECT email FROM users WHERE id = ?', args: [session.userId] }); reporterEmail = er.rows[0]?.email || ''; } catch (_e) {}
    }
    const userId = session ? session.userId : null;
    const result = await db.execute({
      sql: `INSERT INTO campaigns (place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        placeId, platform, JSON.stringify(channels || []), content, deadline || '', link || '',
        JSON.stringify(operatingDays || []), operatingHours || '', excludeHoliday ? 1 : 0,
        reporterNickname || '', reporterEmail || '', reporterBlog || '', reporterInstagram || '', reporterUrl || '',
        source === 'admin' ? 'admin' : 'user', userId
      ]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({
      id, placeId, platform, channels: channels || [], content, deadline: deadline || '', link: link || '',
      operatingDays: operatingDays || [], operatingHours: operatingHours || '', excludeHoliday: !!excludeHoliday,
      reporterNickname: reporterNickname || '', reporterEmail: reporterEmail || '',
      reporterBlog: reporterBlog || '', reporterInstagram: reporterInstagram || '', reporterUrl: reporterUrl || '',
      source: source === 'admin' ? 'admin' : 'user',
      createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    });
  }

  if (req.method === 'PATCH') {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    const body = req.body || {};
    // 부분 업데이트: hidden 토글만 (신고 목록에서 캠페인 숨김/노출). 전체 수정 PATCH는 platform을 항상 보냄.
    if (body.hidden !== undefined && body.platform === undefined) {
      await db.execute({ sql: 'UPDATE campaigns SET hidden = ? WHERE id = ?', args: [body.hidden ? 1 : 0, id] });
      return res.status(200).json({ id, hidden: !!body.hidden });
    }
    const {
      platform, channels, content, deadline, link,
      operatingDays, operatingHours, excludeHoliday
    } = body;
    await db.execute({
      sql: `UPDATE campaigns SET platform = ?, channels = ?, content = ?, deadline = ?, link = ?,
            operating_days = ?, operating_hours = ?, exclude_holiday = ? WHERE id = ?`,
      args: [
        platform, JSON.stringify(channels || []), content, deadline || '', link || '',
        JSON.stringify(operatingDays || []), operatingHours || '', excludeHoliday ? 1 : 0, id
      ]
    });
    return res.status(200).json({ id, platform, channels: channels || [], content, deadline: deadline || '', link: link || '', operatingDays: operatingDays || [], operatingHours: operatingHours || '', excludeHoliday: !!excludeHoliday });
  }

  if (req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    await db.execute({ sql: 'DELETE FROM campaigns WHERE id = ?', args: [id] });
    return res.status(200).json({ id });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method Not Allowed' });
};
