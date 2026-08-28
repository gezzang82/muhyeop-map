#!/usr/bin/env node
/**
 * 요일 재파싱 — 단일요일 캠페인(오탐 가능성)을 원본 페이지에서 다시 파싱해 요일 정정.
 * '할 수 있'의 '수' 오인 등 수정된 파서(scrapeDetail/deriveDays)로 재계산.
 * 미리보기: node scripts/reparse-days.js   /  적용: node scripts/reparse-days.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { scrapeDetail } = require('../api/_scrape');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SINGLE = ['["월"]', '["화"]', '["수"]', '["목"]', '["금"]', '["토"]', '["일"]'];

(async () => {
  const ph = SINGLE.map(() => '?').join(',');
  const rows = (await db.execute({ sql: `SELECT id, link, operating_days FROM campaigns WHERE operating_days IN (${ph}) AND link LIKE '%dinnerqueen%'`, args: SINGLE })).rows;
  console.log('대상 단일요일 캠페인:', rows.length, '건 (재파싱', APPLY ? '적용' : '미리보기', ')');
  let changed = 0, same = 0, fail = 0;
  for (const r of rows) {
    const idm = String(r.link).match(/taste\/(\d+)/);
    if (!idm) { fail++; continue; }
    try {
      const html = await (await fetch('https://dinnerqueen.net/taste/' + idm[1], { headers: { 'User-Agent': UA } })).text();
      const d = scrapeDetail(html, Number(idm[1]));
      const newDays = JSON.stringify(String(d.days || '').split(',').map((s) => s.trim()).filter(Boolean));
      if (newDays === r.operating_days) { same++; }
      else {
        console.log(`  #${r.id} ${r.operating_days} → ${newDays}`);
        changed++;
        if (APPLY) await db.execute({ sql: 'UPDATE campaigns SET operating_days=? WHERE id=?', args: [newDays, r.id] });
      }
    } catch (e) { fail++; }
    await sleep(250);
  }
  console.log(`\n변경 ${changed} · 동일 ${same} · 실패 ${fail}` + (APPLY ? ' — 적용 완료' : ' (--apply로 실제 반영)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
