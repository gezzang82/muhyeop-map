#!/usr/bin/env node
/**
 * 기존 포포몬 캠페인의 제공내용(content)을 상세 재조회로 보강.
 * C_provision만 저장돼 '자유' 등 빈약하던 것을 C_provision + 금액(C_provision_price)으로 재조립.
 * 미리보기: node scripts/backfill-popomon-content.js
 * 적용:     node scripts/backfill-popomon-content.js --apply
 */
const fs = require('fs'), path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const H = { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://popomon.com', Referer: 'https://popomon.com/' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildContent(cd) {
  const provision = String(cd.C_provision || '').trim();
  const price = Number(cd.C_provision_price || 0);
  if (price > 0) return provision ? `${provision} (${price.toLocaleString()}원 상당)` : `${price.toLocaleString()}원 상당`;
  return provision;
}
(async () => {
  const rows = (await db.execute(`SELECT id, link, content FROM campaigns WHERE platform='포포몬' AND link LIKE '%popomon.com/campaign/%'`)).rows;
  console.log(`포포몬 캠페인: ${rows.length}건`);
  const updates = [];
  let done = 0;
  for (const r of rows) {
    const id = (String(r.link).match(/campaign\/(\d+)/) || [])[1];
    if (!id) continue;
    try {
      const res = await fetch(`https://popomon.com/api_p/campaignDetail/fetch_getCampaignData?contentIdx=${id}`, { headers: H });
      done++;
      if (res.ok) {
        const j = await res.json();
        const cd = j.data && j.data.contentsData;
        if (cd) {
          const nc = buildContent(cd);
          if (nc && nc !== r.content) updates.push({ id: r.id, from: r.content, to: nc });
        }
      }
    } catch (e) {}
    await sleep(120);
    if (done % 50 === 0) console.log(`  ...조회 ${done}/${rows.length}, 변경대상 ${updates.length}`);
  }
  console.log(`\n변경 대상: ${updates.length}건`);
  updates.slice(0, 25).forEach(u => console.log(`  #${u.id}: "${String(u.from).slice(0, 25)}" → "${u.to}"`));
  if (!APPLY) { console.log('\n[미리보기] --apply'); return; }
  for (const u of updates) await db.execute({ sql: 'UPDATE campaigns SET content=? WHERE id=?', args: [u.to, u.id] });
  console.log(`\n[적용완료] ${updates.length}건`);
})().catch(e => { console.error(e); process.exit(1); });
