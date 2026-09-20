#!/usr/bin/env node
/**
 * 기존 '기타' 매장 중 레뷰 캠페인이 달린 것을, 레뷰 API의 업종 태그(it.category / 상세 tags)로 재분류.
 * (2026-09-20: 레뷰는 venue.category가 대부분 'other'라 과거 수집분이 '기타'로 몰렸음)
 *
 * 미리보기: node scripts/reclassify-revu-etc.js
 * 적용:     node scripts/reclassify-revu-etc.js --apply
 */
const fs = require('fs'), path = require('path');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = require('@libsql/client');
const S = require('../api/_scrape');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const REVU_API = 'https://api.weble.net';
const H = { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://www.revu.net', Referer: 'https://www.revu.net/' };
const TAG = {
  '맛집': '음식점', '카페': '카페', '디저트': '카페',
  '뷰티샵': '뷰티', '뷰티': '뷰티', '스킨케어': '뷰티', '메이크업': '뷰티', '바디': '뷰티', '헤어': '뷰티',
  '숙박': '숙박/여가', '여행': '숙박/여가', '문화': '문화',
  '잡화': '안경/잡화', '안경': '안경/잡화', '지역_기타': '기타', '지역-기타': '기타', '기타': '기타',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 기타 매장 + 레뷰 캠페인 링크(→ revu id)
  const rows = (await db.execute(`
    SELECT p.id AS pid, p.name AS name, c.link AS link, c.content AS content
    FROM places p JOIN campaigns c ON c.place_id = p.id
    WHERE p.category='기타' AND c.platform='레뷰' AND c.link LIKE '%revu.net/campaign/%'
    GROUP BY p.id`)).rows;
  console.log(`레뷰 캠페인 달린 '기타' 매장: ${rows.length}건`);
  if (!rows.length) return;

  const token = await S.revuLogin();
  const plan = {}; // target cat → [{pid,name}]
  let fetched = 0, resolved = 0;
  for (const r of rows) {
    const id = (String(r.link).match(/campaign\/(\d+)/) || [])[1];
    if (!id) continue;
    let cat = S.categoryByKeyword(String(r.content || '') + ' ' + r.name, r.name); // 내용 키워드 우선(운동 등)
    if (!cat) {
      try {
        const res = await fetch(`${REVU_API}/campaigns/${id}`, { headers: { ...H, Authorization: `Bearer ${token}` } });
        fetched++;
        if (res.ok) {
          const j = await res.json(); const d = (j && (j.data || j)) || {};
          const tags = (d.tags || []).filter(t => t.type === 'category').map(t => t.name);
          cat = tags.map(t => TAG[String(t).trim()]).find(Boolean) || null;
        }
        await sleep(150);
      } catch (e) {}
    }
    if (cat && cat !== '기타') { (plan[cat] = plan[cat] || []).push({ pid: r.pid, name: r.name }); resolved++; }
    if (fetched % 50 === 0 && fetched) console.log(`  ...fetch ${fetched}, 해결 ${resolved}`);
  }
  console.log(`\n=== 재분류 계획 (총 ${resolved}건) ===`);
  for (const [cat, arr] of Object.entries(plan)) {
    console.log(`  ${cat}: ${arr.length}건  예) ${arr.slice(0, 5).map(x => x.name).join(', ')}`);
  }
  if (!APPLY) { console.log('\n[미리보기] 적용하려면 --apply'); return; }
  let done = 0;
  for (const [cat, arr] of Object.entries(plan)) {
    for (let i = 0; i < arr.length; i += 200) {
      const ids = arr.slice(i, i + 200).map(x => x.pid);
      const ph = ids.map(() => '?').join(',');
      const rr = await db.execute({ sql: `UPDATE places SET category=? WHERE category='기타' AND id IN (${ph})`, args: [cat, ...ids] });
      done += Number(rr.rowsAffected || 0);
    }
  }
  console.log(`\n[적용완료] ${done}건 재분류`);
})().catch(e => { console.error(e); process.exit(1); });
