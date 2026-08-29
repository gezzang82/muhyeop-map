#!/usr/bin/env node
/**
 * 강남맛집 pending 스테이징 보강 — 옛 코드로 지역만("서울 중구") 적재된 승인대기 항목을
 * 상세파싱으로 풀주소+요일+공휴일 채워, 등록 시 처음부터 정확하게.
 *
 * 미리보기: node scripts/enrich-staged-gangnam.js         (30건)
 * 전체적용: node scripts/enrich-staged-gangnam.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { gnScrapeDetail } = require('../api/_scrape');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRegionOnly = (a) => !/[0-9]/.test(a || '') && !/(동|로|길|읍|면|가)\b/.test(a || '');

(async () => {
  const rows = (await db.execute("SELECT id, source_id, name, address FROM scraped_items WHERE platform='강남맛집' AND status='pending'")).rows
    .filter((r) => isRegionOnly(r.address) && r.source_id);
  const LIMIT = APPLY ? rows.length : Math.min(30, rows.length);
  console.log(`강남 pending 지역만-주소: ${rows.length}건 (${APPLY ? '전체 적용' : `미리보기 ${LIMIT}`})\n`);
  let addr = 0, days = 0, err = 0, noAddr = 0;
  for (let i = 0; i < LIMIT; i++) {
    const r = rows[i];
    try {
      const d = await gnScrapeDetail(r.source_id, r.name);
      await sleep(90);
      if (!d.address || isRegionOnly(d.address)) { noAddr++; continue; }
      addr++; if (d.days) days++;
      if (i < 20 || !APPLY) console.log(`  ✔ ${r.name}: "${r.address}" → "${d.address}"${d.days ? ' · ' + d.days : ''}`);
      if (APPLY) await db.execute({ sql: 'UPDATE scraped_items SET address=?, days=?, exclude_holiday=? WHERE id=?', args: [d.address, d.days || '', d.excludeHoliday || 0, r.id] });
    } catch (e) { err++; }
    if (i % 200 === 0 && i) console.log(`  … ${i}/${LIMIT} (주소 ${addr} · 요일 ${days} · 오류 ${err})`);
  }
  console.log(`\n주소보강 ${addr} · 요일 ${days} · 주소못얻음 ${noAddr} · 오류 ${err}` + (APPLY ? ' — 적용완료' : ' (--apply)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
