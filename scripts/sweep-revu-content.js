// 레뷰 협찬내용(제공내역) 전수 스윕: 등록된 레뷰 캠페인의 content를 상세 API의 실제 제공내역으로 재수집.
// 목록 campaignData.reward("증명사진" 등 축약) → 상세 reward(=blogRewardDetail, "[1인 1회] 여권사진…") 로 교체.
// 겸사겸사 operating_hours에 ★☆※ 조각이 남은 legacy도 정리.
// 사용: node scripts/sweep-revu-content.js         (DRY-RUN)
//       node scripts/sweep-revu-content.js apply    (실제 반영)
// ⚠️ 운영 DB(TURSO_PROD_*) 대상. 크롤러 정지 상태에서 실행 권장(Turso 경합/레뷰 이중부하 방지).
const fs = require('fs');
const { createClient } = require('@libsql/client');
const S = require('../api/_scrape.js');
const APPLY = process.argv[2] === 'apply';

function envGet(k) {
  const env = fs.readFileSync(__dirname + '/../.env.local', 'utf8');
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 레뷰 로그인
  process.env.REVU_ID = envGet('REVU_ID'); process.env.REVU_PW = envGet('REVU_PW');
  const token = await S.revuLogin();
  if (!token) { console.log('레뷰 로그인 실패 — REVU_ID/PW 확인'); return; }
  console.log('레뷰 로그인 OK |', APPLY ? 'APPLY' : 'DRY-RUN');

  const db = createClient({ url: envGet('TURSO_PROD_URL'), authToken: envGet('TURSO_PROD_AUTH_TOKEN') });
  const rows = (await db.execute("SELECT id, link, content, operating_hours FROM campaigns WHERE platform='레뷰' ORDER BY id DESC")).rows;
  console.log('레뷰 캠페인 총:', rows.length);

  let contentFixed = 0, hoursFixed = 0, skipped = 0, err = 0;
  for (const r of rows) {
    const m = String(r.link || '').match(/campaign\/(\d+)/);
    if (!m) { skipped++; continue; }
    let detail;
    try { detail = await S.revuFetchDetail(token, m[1]); } catch (e) { err++; await sleep(200); continue; }
    await sleep(200);
    const updates = {};
    // content: 상세 제공내역이 있고 현재와 다르면 교체
    if (detail.reward && detail.reward.length >= 2 && detail.reward !== r.content) updates.content = detail.reward;
    // hours: ★☆※ 조각 남았으면 재산출(revuVisitHours) 또는 컷
    const curH = String(r.operating_hours || '');
    if (/[★☆※]/.test(curH)) {
      const nh = S.revuVisitHours(detail.alt || '') || curH.split(/[★☆※]/)[0].trim();
      if (nh !== curH) updates.operating_hours = /[★☆※]/.test(nh) ? '' : nh;
    }
    if (!Object.keys(updates).length) continue;
    const sets = Object.keys(updates).map(k => `${k}=?`).join(', ');
    const args = Object.values(updates); args.push(r.id);
    if (updates.content) contentFixed++;
    if (updates.operating_hours !== undefined) hoursFixed++;
    if (APPLY) await db.execute({ sql: `UPDATE campaigns SET ${sets} WHERE id=?`, args });
    if (contentFixed + hoursFixed <= 40 || (contentFixed + hoursFixed) % 25 === 0)
      console.log(`#${r.id}`, updates.content ? `content:${JSON.stringify((r.content||'').slice(0,20))}→${JSON.stringify(updates.content.slice(0,40))}` : '', updates.operating_hours !== undefined ? `hours:${JSON.stringify(curH)}→${JSON.stringify(updates.operating_hours)}` : '');
  }
  console.log(`\n완료 | content교체: ${contentFixed} | hours정리: ${hoursFixed} | link없음: ${skipped} | 에러: ${err} | ${APPLY ? '반영됨' : 'DRY(반영안함)'}`);
})();
