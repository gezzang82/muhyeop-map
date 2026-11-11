// 광고 구좌 배너 ad_banners 초기 시드(운영, TURSO_PROD_*).
// 현재 하드코딩으로 라이브 중인 '하늘정원' 후기피드 배너를 DB로 이관 → 배포 후에도 유지(공백 없음).
// 사용: node scripts/seed-ad-banners.cjs           (DRY, 미리보기)
//       node scripts/seed-ad-banners.cjs apply     (실제 INSERT)
// 멱등: 각 slot(feed/home)에 이미 행이 있으면 건너뜀. 배포 '전' 실행 권장(구버전 app.js는 ad_banners 무시).
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8')
  .split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const APPLY = process.argv.includes('apply');

const SEED = [
  { slot: 'feed', image: 'image/ad_slot_feed.png', link: 'https://myskygarden.com/' },
  { slot: 'home', image: 'image/ad_slot_home.png', link: '' },
];

(async () => {
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });
  await db.execute(`CREATE TABLE IF NOT EXISTS ad_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slot TEXT NOT NULL, image_url TEXT, link_url TEXT,
    enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')))`);
  const existing = (await db.execute("SELECT id, slot, image_url, enabled FROM ad_banners ORDER BY slot, sort_order")).rows;
  console.log('기존 ad_banners 행:', existing.length);
  existing.forEach(r => console.log('  -', r.slot, '#' + r.id, r.image_url, 'enabled=' + r.enabled));

  for (const s of SEED) {
    if (existing.some(r => r.slot === s.slot)) { console.log(`SKIP ${s.slot}: 이미 존재`); continue; }
    console.log(`${APPLY ? 'INSERT' : 'DRY INSERT'} ${s.slot}: ${s.image} link=${s.link || '(없음)'}`);
    if (APPLY) {
      await db.execute({
        sql: "INSERT INTO ad_banners (slot, image_url, link_url, enabled, sort_order) VALUES (?,?,?,1,0)",
        args: [s.slot, s.image, s.link],
      });
    }
  }
  if (APPLY) {
    const after = (await db.execute("SELECT id, slot, image_url, link_url, enabled FROM ad_banners ORDER BY slot, sort_order")).rows;
    console.log('\n=== 적용 후 ===');
    after.forEach(r => console.log('  -', r.slot, '#' + r.id, r.image_url, 'link=' + (r.link_url || '-'), 'enabled=' + r.enabled));
  } else {
    console.log('\n(DRY) 적용하려면: node scripts/seed-ad-banners.cjs apply');
  }
})();
