#!/usr/bin/env node
/**
 * 링블 재파싱 — 상세를 새 파서로 다시 읽어 요일/시간/공휴일 정정.
 *  A) 승인대기 scraped_items(platform='링블') → hours/days/exclude_holiday
 *  B) 등록 campaigns(link=ringble detail) → operating_hours/operating_days/exclude_holiday
 * 미리보기: node scripts/reparse-ringble.js   /  적용: node scripts/reparse-ringble.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { rbScrapeDetail } = require('../api/_scrape');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arr = (s) => JSON.stringify(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));

(async () => {
  let chg = 0, same = 0, fail = 0;
  // A) 승인대기
  const staged = (await db.execute("SELECT id, source_id, hours, days, exclude_holiday FROM scraped_items WHERE platform='링블' AND status='pending'")).rows;
  console.log(`A) 승인대기 링블: ${staged.length}건`);
  for (const r of staged) {
    try {
      const d = await rbScrapeDetail(r.source_id); await sleep(120);
      const eh = d.excludeHoliday || 0;
      if (d.hours === (r.hours || '') && d.days === (r.days || '') && eh === (r.exclude_holiday || 0)) { same++; continue; }
      chg++; if (chg <= 20) console.log(`  #${r.source_id} 시간["${r.hours}"→"${d.hours}"] 요일[${r.days}→${d.days}] 공휴일[${r.exclude_holiday}→${eh}]`);
      if (APPLY) await db.execute({ sql: 'UPDATE scraped_items SET hours=?, days=?, exclude_holiday=? WHERE id=?', args: [d.hours || '', d.days || '', eh, r.id] });
    } catch (e) { fail++; }
  }
  // B) 등록 캠페인
  const camps = (await db.execute("SELECT id, link, operating_hours, operating_days, exclude_holiday FROM campaigns WHERE link LIKE '%ringble.co.kr/detail.php%'")).rows;
  console.log(`\nB) 등록 링블 캠페인: ${camps.length}건`);
  for (const r of camps) {
    const num = (String(r.link).match(/number=(\d+)/) || [])[1]; if (!num) { fail++; continue; }
    try {
      const d = await rbScrapeDetail(num); await sleep(120);
      const eh = d.excludeHoliday || 0; const newDays = arr(d.days);
      if ((d.hours || '') === (r.operating_hours || '') && newDays === (r.operating_days || '[]') && eh === (r.exclude_holiday || 0)) { same++; continue; }
      chg++; if (chg <= 40) console.log(`  camp#${r.id} 시간["${r.operating_hours}"→"${d.hours}"] 요일[${r.operating_days}→${newDays}] 공휴일[${r.exclude_holiday}→${eh}]`);
      if (APPLY) await db.execute({ sql: 'UPDATE campaigns SET operating_hours=?, operating_days=?, exclude_holiday=? WHERE id=?', args: [d.hours || '', newDays, eh, r.id] });
    } catch (e) { fail++; }
  }
  console.log(`\n변경 ${chg} · 동일 ${same} · 실패 ${fail}` + (APPLY ? ' — 적용완료' : ' (--apply)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
