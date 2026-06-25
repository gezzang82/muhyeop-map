const { getDb } = require('./_db');
const { readSession } = require('./auth/_session');

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
    const result = await db.execute('SELECT * FROM campaigns');
    return res.status(200).json(result.rows.map(toCampaign));
  }

  if (req.method === 'POST') {
    const {
      placeId, platform, channels, content, deadline, link,
      operatingDays, operatingHours, excludeHoliday,
      reporterBlog, reporterInstagram, reporterUrl, source
    } = req.body || {};
    if (!placeId || !platform || !content || !channels?.length) {
      return res.status(400).json({ error: 'placeId, platform, content, channels는 필수입니다.' });
    }
    const session = readSession(req);
    const reporterNickname = session ? session.nickname : (req.body?.reporterNickname || '');
    const reporterEmail = session ? (session.email || '') : (req.body?.reporterEmail || '');
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
    const id = Number(req.query.id);
    if (!id) {
      return res.status(400).json({ error: 'id는 필수입니다.' });
    }
    const {
      platform, channels, content, deadline, link,
      operatingDays, operatingHours, excludeHoliday
    } = req.body || {};
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
