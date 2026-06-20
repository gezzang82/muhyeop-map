const { getDb } = require('./_db');

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
    source: row.source || 'unknown'
  };
}

module.exports = async function handler(req, res) {
  const db = getDb();
  try {
    await db.execute("ALTER TABLE campaigns ADD COLUMN source TEXT DEFAULT 'unknown'");
  } catch (e) {
    // 컬럼이 이미 있으면 무시
  }

  if (req.method === 'GET') {
    const result = await db.execute('SELECT * FROM campaigns');
    return res.status(200).json(result.rows.map(toCampaign));
  }

  if (req.method === 'POST') {
    const {
      placeId, platform, channels, content, deadline, link,
      operatingDays, operatingHours, excludeHoliday,
      reporterNickname, reporterEmail, reporterBlog, reporterInstagram, reporterUrl, source
    } = req.body || {};
    if (!placeId || !platform || !content || !deadline || !channels?.length) {
      return res.status(400).json({ error: 'placeId, platform, content, deadline, channels는 필수입니다.' });
    }
    const result = await db.execute({
      sql: `INSERT INTO campaigns (place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        placeId, platform, JSON.stringify(channels || []), content, deadline, link || '',
        JSON.stringify(operatingDays || []), operatingHours || '', excludeHoliday ? 1 : 0,
        reporterNickname || '', reporterEmail || '', reporterBlog || '', reporterInstagram || '', reporterUrl || '',
        source === 'admin' ? 'admin' : 'user'
      ]
    });
    const id = Number(result.lastInsertRowid);
    return res.status(201).json({
      id, placeId, platform, channels: channels || [], content, deadline, link: link || '',
      operatingDays: operatingDays || [], operatingHours: operatingHours || '', excludeHoliday: !!excludeHoliday,
      reporterNickname: reporterNickname || '', reporterEmail: reporterEmail || '',
      reporterBlog: reporterBlog || '', reporterInstagram: reporterInstagram || '', reporterUrl: reporterUrl || '',
      source: source === 'admin' ? 'admin' : 'user'
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
        platform, JSON.stringify(channels || []), content, deadline, link || '',
        JSON.stringify(operatingDays || []), operatingHours || '', excludeHoliday ? 1 : 0, id
      ]
    });
    return res.status(200).json({ id, platform, channels: channels || [], content, deadline, link: link || '', operatingDays: operatingDays || [], operatingHours: operatingHours || '', excludeHoliday: !!excludeHoliday });
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
