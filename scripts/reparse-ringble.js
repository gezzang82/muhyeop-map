#!/usr/bin/env node
/**
 * 링블 재파싱 — 상세를 새 파서로 다시 읽어 채널/요일/시간/공휴일/내용 정정.
 *  A) 승인대기 scraped_items(platform='링블')  B) 등록 campaigns(link=ringble, 활성만)
 * 안전규칙: 상세 이름 없으면(만료) 스킵, 새 값 비면 기존 유지(빈값 덮어쓰기 금지).
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
const ACTIVE_ONLY = process.argv.includes('--active-only'); // A(승인대기) 건너뛰고 B(활성 캠페인)만
const STAGED_ONLY = process.argv.includes('--staged-only'); // B(활성 캠페인) 건너뛰고 A(승인대기)만
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arr = (s) => JSON.stringify(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));
const numOf = (link) => (String(link).match(/number=(\d+)/) || [])[1];

(async () => {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let chg = 0, same = 0, fail = 0, skip = 0, printed = 0;
  // A) 승인대기
  const staged = ACTIVE_ONLY ? [] : (await db.execute("SELECT id, source_id, channel, days, hours, content, exclude_holiday FROM scraped_items WHERE platform='링블' AND status='pending'")).rows;
  console.log(ACTIVE_ONLY ? 'A) 승인대기 링블: 건너뜀(--active-only)' : `A) 승인대기 링블: ${staged.length}건`);
  for (const r of staged) {
    try {
      const d = await rbScrapeDetail(r.source_id); await sleep(120);
      if (!d.name) { skip++; continue; }
      const nc = d.channel || r.channel || '', nd = d.days || r.days || '', nh = d.hours || r.hours || '', nco = d.content || r.content || '', eh = d.excludeHoliday || 0;
      if (nc === (r.channel || '') && nh === (r.hours || '') && nd === (r.days || '') && nco === (r.content || '') && eh === (r.exclude_holiday || 0)) { same++; continue; }
      chg++; if (printed++ < 15) console.log(`  #${r.source_id} 채널[${r.channel}→${nc}] 요일[${r.days}→${nd}]`);
      if (APPLY) await db.execute({ sql: 'UPDATE scraped_items SET channel=?, days=?, hours=?, content=?, exclude_holiday=? WHERE id=?', args: [nc, nd, nh, nco, eh, r.id] });
    } catch (e) { fail++; }
  }
  // B) 등록 캠페인 — 활성만
  const camps = STAGED_ONLY ? [] : (await db.execute({ sql: "SELECT id, link, channels, operating_days, operating_hours, content, exclude_holiday FROM campaigns WHERE link LIKE '%ringble.co.kr/detail.php%' AND (deadline='' OR deadline IS NULL OR deadline >= ?)", args: [today] })).rows;
  console.log(`\nB) 등록 링블 활성 캠페인: ${camps.length}건`);
  printed = 0;
  for (const r of camps) {
    const num = numOf(r.link); if (!num) { fail++; continue; }
    try {
      const d = await rbScrapeDetail(num); await sleep(120);
      if (!d.name) { skip++; continue; }
      const eh = d.excludeHoliday || 0;
      const newCh = d.channel ? arr(d.channel) : (r.channels || '[]');
      const newDays = d.days ? arr(d.days) : (r.operating_days || '[]');
      const newHours = d.hours; // 페이지 유효(!d.name 스킵)면 새 파서값 신뢰 — 시간없는 안내문은 빈값으로 정정
      const newContent = d.content || r.content || '';
      if (newCh === (r.channels || '[]') && newHours === (r.operating_hours || '') && newDays === (r.operating_days || '[]') && newContent === (r.content || '') && eh === (r.exclude_holiday || 0)) { same++; continue; }
      chg++; if (printed++ < 20) console.log(`  camp#${r.id} 채널[${r.channels}→${newCh}] 요일[${r.operating_days}→${newDays}]`);
      if (APPLY) await db.execute({ sql: 'UPDATE campaigns SET channels=?, operating_days=?, operating_hours=?, content=?, exclude_holiday=? WHERE id=?', args: [newCh, newDays, newHours, newContent, eh, r.id] });
    } catch (e) { fail++; }
  }
  console.log(`\n변경 ${chg} · 동일 ${same} · 스킵(만료) ${skip} · 실패 ${fail}` + (APPLY ? ' — 적용완료' : ' (--apply)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
