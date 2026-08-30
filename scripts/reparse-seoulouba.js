#!/usr/bin/env node
/**
 * 서울오빠 전수 재파싱 — 상세를 새 파서로 다시 읽어 요일/시간/채널/공휴일 정정.
 *  A) 승인대기 scraped_items(platform='서울오빠') → days/hours/channel/exclude_holiday
 *  B) 등록 campaigns(link=seoulouba) → operating_days/operating_hours/channels/exclude_holiday
 * 미리보기: node scripts/reparse-seoulouba.js   /  적용: node scripts/reparse-seoulouba.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { soScrapeDetail } = require('../api/_scrape');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arr = (s) => JSON.stringify(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));
const cidOf = (link) => (String(link).match(/c=(\d+)/) || [])[1];

(async () => {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let chg = 0, same = 0, fail = 0, skip = 0, printed = 0;
  // A) 승인대기 (최근 수집 — 페이지 유효)
  const staged = (await db.execute("SELECT id, source_id, channel, days, hours, content, exclude_holiday FROM scraped_items WHERE platform='서울오빠' AND status='pending'")).rows;
  console.log(`A) 승인대기 서울오빠: ${staged.length}건`);
  for (const r of staged) {
    try {
      const d = await soScrapeDetail(r.source_id); await sleep(120);
      if (!d.name) { skip++; continue; }                    // 만료/무효 페이지 → 건드리지 않음
      const nd = d.days || r.days || '', nh = d.hours || r.hours || '', nc = d.channel || r.channel || '', nco = d.content || r.content || '', eh = d.excludeHoliday || 0; // 새값 없으면 기존 유지
      if (nh === (r.hours || '') && nd === (r.days || '') && nc === (r.channel || '') && nco === (r.content || '') && eh === (r.exclude_holiday || 0)) { same++; continue; }
      chg++; if (printed++ < 15) console.log(`  #${r.source_id} 요일[${r.days}→${nd}] 시간["${r.hours}"→"${nh}"] 채널[${r.channel}→${nc}]`);
      if (APPLY) await db.execute({ sql: 'UPDATE scraped_items SET days=?, hours=?, channel=?, content=?, exclude_holiday=? WHERE id=?', args: [nd, nh, nc, nco, eh, r.id] });
    } catch (e) { fail++; }
  }
  // B) 등록 캠페인 — 활성(마감 미래/상시)만. 만료는 지도에 안 나오고 페이지도 바뀌어 위험.
  const camps = (await db.execute({ sql: "SELECT id, link, channels, operating_days, operating_hours, content, exclude_holiday FROM campaigns WHERE link LIKE '%seoulouba%' AND (deadline='' OR deadline IS NULL OR deadline >= ?)", args: [today] })).rows;
  console.log(`\nB) 등록 서울오빠 활성 캠페인: ${camps.length}건`);
  printed = 0;
  for (const r of camps) {
    const c = cidOf(r.link); if (!c) { fail++; continue; }
    try {
      const d = await soScrapeDetail(c); await sleep(120);
      if (!d.name) { skip++; continue; }                    // 만료/무효 → 스킵
      const eh = d.excludeHoliday || 0;
      const newDays = d.days ? arr(d.days) : (r.operating_days || '[]');   // 빈값이면 기존 유지
      const newCh = d.channel ? arr(d.channel) : (r.channels || '[]');
      const newHours = d.hours || r.operating_hours || '';
      const newContent = d.content || r.content || '';
      if (newHours === (r.operating_hours || '') && newDays === (r.operating_days || '[]') && newCh === (r.channels || '[]') && newContent === (r.content || '') && eh === (r.exclude_holiday || 0)) { same++; continue; }
      chg++; if (printed++ < 25) console.log(`  camp#${r.id} 요일[${r.operating_days}→${newDays}] 시간["${r.operating_hours}"→"${newHours}"] 내용["${(r.content||'').slice(0,15)}"→"${newContent.slice(0,15)}"]`);
      if (APPLY) await db.execute({ sql: 'UPDATE campaigns SET operating_days=?, operating_hours=?, channels=?, content=?, exclude_holiday=? WHERE id=?', args: [newDays, newHours, newCh, newContent, eh, r.id] });
    } catch (e) { fail++; }
  }
  console.log(`\n변경 ${chg} · 동일 ${same} · 스킵(만료/무효) ${skip} · 실패 ${fail}` + (APPLY ? ' — 적용완료' : ' (--apply)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
