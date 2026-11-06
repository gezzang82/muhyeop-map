// 만료 캠페인 정리 (운영, TURSO_PROD_*). 체험단 회전이 빨라 만료분이 대량 누적 → Turso 읽기/스토리지 절감.
// 삭제 대상: ①마감일이 N일+ 지난 날짜형  ②상시(빈 마감)인데 등록 N일+ 지난 것.  (활성·상시 유효분은 절대 미포함)
// 그 캠페인의 campaign_events(조회/클릭)도 함께 삭제(orphan 방지). reports는 참조만, 미삭제(기록 보존).
// 사용: node scripts/purge-expired-campaigns.js            (DRY, 기본 60일)
//       node scripts/purge-expired-campaigns.js 60         (DRY, 보존 60일 명시)
//       node scripts/purge-expired-campaigns.js 60 apply   (실제 삭제)
// 주기 실행 권장(크롤러가 계속 쌓음). ⚠️ 되돌릴 수 없음 — 반드시 DRY로 건수 확인 후 apply.
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');

const DAYS = Math.max(14, parseInt(process.argv[2], 10) || 60);   // 최소 14일 가드(너무 짧은 보존 실수 방지)
const APPLY = process.argv.includes('apply');
const BATCH = 2000;
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

(async () => {
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });
  // 삭제 대상 WHERE (활성·상시유효 제외): 날짜형 마감 N일+ 경과 OR 상시(빈값) 등록 N일+ 경과
  const WHERE = `((deadline != '' AND deadline IS NOT NULL AND deadline < date('now','+9 hours','-${DAYS} day'))
    OR ((deadline='' OR deadline IS NULL) AND created_at < datetime('now','-${DAYS} days')))`;

  const total0 = Number((await db.execute('SELECT COUNT(*) n FROM campaigns')).rows[0].n);
  const ids = (await db.execute(`SELECT id FROM campaigns WHERE ${WHERE}`)).rows.map(r => Number(r.id));
  const srcs = (await db.execute(`SELECT COALESCE(source,'(null)') s, COUNT(*) n FROM campaigns WHERE ${WHERE} GROUP BY s ORDER BY n DESC`)).rows;
  console.log(`${APPLY ? '🔴 APPLY' : '🟡 DRY'} | 보존 ${DAYS}일 | 전체 ${total0.toLocaleString()} → 삭제대상 ${ids.length.toLocaleString()} (source: ${srcs.map(r => `${r.s}:${r.n}`).join(' ')})`);
  if (!ids.length) { console.log('삭제할 것 없음'); return; }

  if (!APPLY) {
    const ev = Number((await db.execute(`SELECT COUNT(*) n FROM campaign_events WHERE campaign_id IN (SELECT id FROM campaigns WHERE ${WHERE})`)).rows[0].n);
    console.log(`  함께 삭제될 campaign_events: ${ev.toLocaleString()}`);
    console.log(`  실행하려면: node scripts/purge-expired-campaigns.js ${DAYS} apply`);
    return;
  }

  let delC = 0, delE = 0;
  for (const part of chunk(ids, BATCH)) {
    const ph = part.map(() => '?').join(',');
    const er = await db.execute({ sql: `DELETE FROM campaign_events WHERE campaign_id IN (${ph})`, args: part });
    delE += er.rowsAffected || 0;
    const cr = await db.execute({ sql: `DELETE FROM campaigns WHERE id IN (${ph})`, args: part });
    delC += cr.rowsAffected || 0;
    process.stdout.write(`\r  삭제 진행: 캠페인 ${delC.toLocaleString()} / 이벤트 ${delE.toLocaleString()}`);
  }
  const total1 = Number((await db.execute('SELECT COUNT(*) n FROM campaigns')).rows[0].n);
  console.log(`\n완료 | 캠페인 ${total0.toLocaleString()} → ${total1.toLocaleString()} (삭제 ${delC.toLocaleString()}) | 이벤트 삭제 ${delE.toLocaleString()}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
