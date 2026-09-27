// 승인 대기(scraped_items status=pending) 배치 등록.
// 오토파일럿 insert 로직 재현(매장 name+좌표 dedup, 캠페인 link dedup), source='admin'(수집 승인).
// 지오코딩 실패/채널 없음은 건너뛰고 pending 유지. HTTP API 대신 DB 직접(레이트리밋 회피).
// 사용: node scripts/approve-staged-batch.js         (DRY: 등록 안 함, 결과만)
//       node scripts/approve-staged-batch.js apply    (실제 등록)
const fs = require('fs');
fs.readFileSync(__dirname + '/../.env.local', 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const { geocodeServer, inKorea } = require('../api/_geocode.js');
const APPLY = process.argv[2] === 'apply';
const g = k => process.env[k] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

async function insertPlace(db, { name, address, lat, lng, category }) {
  const nkey = String(name).replace(/ /g, '');
  const near = await db.execute({ sql: 'SELECT id, name FROM places WHERE lat > ? AND lat < ? AND lng > ? AND lng < ?', args: [lat - 0.0007, lat + 0.0007, lng - 0.0007, lng + 0.0007] });
  const hit = near.rows.find(p => String(p.name).replace(/ /g, '') === nkey);
  if (hit) return { id: Number(hit.id), reused: true };
  const r = await db.execute({ sql: `INSERT INTO places (name, address, lat, lng, category, founder_nickname, founder_email, founder_url, founder_user_id) VALUES (?,?,?,?,?,'','','',NULL)`, args: [name, address, lat, lng, category] });
  return { id: Number(r.lastInsertRowid), reused: false };
}
async function insertCampaign(db, placeId, r, category) {
  const link = r.source_url || '';
  if (link) { const dup = await db.execute({ sql: 'SELECT id FROM campaigns WHERE link=? LIMIT 1', args: [link] }); if (dup.rows.length) return { id: Number(dup.rows[0].id), dup: true }; }
  const res = await db.execute({
    sql: `INSERT INTO campaigns (place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source, user_id) VALUES (?,?,?,?,?,?,?,?,?,'','','','','','admin',NULL)`,
    args: [placeId, r.platform || '', JSON.stringify(csv(r.channel)), r.content || '', r.deadline || '', link, JSON.stringify(csv(r.days)), r.hours || '', r.exclude_holiday ? 1 : 0],
  });
  return { id: Number(res.lastInsertRowid), dup: false };
}
(async () => {
  const db = createClient({ url: g('TURSO_PROD_URL'), authToken: g('TURSO_PROD_AUTH_TOKEN') });
  const rows = (await db.execute("SELECT id, platform, name, address, category, channel, content, deadline, source_url, days, hours, exclude_holiday FROM scraped_items WHERE status='pending' ORDER BY id")).rows;
  console.log(`대상 ${rows.length}건 | ${APPLY ? 'APPLY' : 'DRY'}`);
  let reg = 0, noCh = 0, geoFail = 0, err = 0, reusedP = 0;
  for (const r of rows) {
    try {
      if (!csv(r.channel).length) { noCh++; continue; }
      const c = await geocodeServer({ name: r.name, address: r.address });
      await sleep(120);
      if (!c || !c.lat || !inKorea(c.lat, c.lng)) { geoFail++; continue; }
      if (!APPLY) { reg++; continue; }
      const p = await insertPlace(db, { name: r.name, address: r.address, lat: c.lat, lng: c.lng, category: r.category || '기타' });
      if (p.reused) reusedP++;
      const camp = await insertCampaign(db, p.id, r, r.category || '기타');
      await db.execute({ sql: `UPDATE scraped_items SET status='registered', created_campaign_id=?, auto_seen=1, auto_note='배치 승인', reviewed_at=datetime('now','+9 hours') WHERE id=?`, args: [camp.id, r.id] });
      reg++;
    } catch (e) { err++; console.log('  err', r.id, String(e.message || e).slice(0, 80)); }
  }
  const pend = (await db.execute("SELECT COUNT(*) n FROM scraped_items WHERE status='pending'")).rows[0].n;
  console.log(`\n등록${APPLY ? '' : '가능'}: ${reg} | 채널없음(건너뜀): ${noCh} | 지오코딩실패(건너뜀): ${geoFail} | 에러: ${err}${APPLY ? ` | 매장재사용: ${reusedP}` : ''}`);
  console.log('남은 승인대기:', pend);
})();
