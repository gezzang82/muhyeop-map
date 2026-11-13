// 기존 places.name에 HTML 엔티티(&amp; · &#39; · &lt; 등)가 그대로 저장돼 화면/인스타 이미지에 노출되던 것 교정.
//  원인: 크롤러 cleanStoreName이 엔티티 디코드를 안 했음(2026-11-13 수정). 이 스크립트는 그 전에 쌓인 레거시 행을 정리.
// 사용: node scripts/sweep-html-entities.cjs          (DRY — 바뀔 행만 출력, 쓰기 없음)
//       node scripts/sweep-html-entities.cjs apply    (실제 UPDATE)
// 운영 DB(TURSO_PROD_*) 대상. 안전: 디코드 결과가 다를 때만 UPDATE, 멱등.
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const { decodeEntities } = require('../api/_scrape');
const APPLY = process.argv.includes('apply');

(async () => {
  const url = process.env.TURSO_PROD_URL, authToken = process.env.TURSO_PROD_AUTH_TOKEN;
  if (!url) { console.error('TURSO_PROD_URL 없음 (.env.local 확인)'); process.exit(1); }
  const db = createClient({ url, authToken });
  // 엔티티 흔적이 있는 행만 후보로(전수스캔 최소화)
  const rows = (await db.execute(
    "SELECT id, name FROM places WHERE name LIKE '%&amp;%' OR name LIKE '%&#%' OR name LIKE '%&lt;%' OR name LIKE '%&gt;%' OR name LIKE '%&quot;%' OR name LIKE '%&nbsp;%' OR name LIKE '%&apos;%'"
  )).rows;
  const changes = [];
  for (const r of rows) {
    const dec = decodeEntities(r.name);
    if (dec !== r.name) changes.push({ id: r.id, from: r.name, to: dec });
  }
  console.log(`후보 ${rows.length}행 중 교정 대상 ${changes.length}행${APPLY ? ' (APPLY)' : ' (DRY)'}`);
  changes.slice(0, 50).forEach(c => console.log(`  #${c.id}  ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`));
  if (changes.length > 50) console.log(`  … 외 ${changes.length - 50}행`);
  if (!APPLY) { console.log('\nDRY 종료. 적용하려면: node scripts/sweep-html-entities.cjs apply'); return; }
  let n = 0;
  for (const c of changes) {
    await db.execute({ sql: 'UPDATE places SET name=? WHERE id=?', args: [c.to, c.id] });
    n++;
  }
  console.log(`\n완료: ${n}행 UPDATE.`);
})().catch(e => { console.error(e); process.exit(1); });
