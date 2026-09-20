#!/usr/bin/env node
/**
 * 기존 '기타' 매장 중 운동/피트니스(헬스·필라테스·요가·골프·크로스핏·PT·복싱·주짓수·테니스 등)를
 * '운동' 카테고리로 일괄 재분류. (2026-09-20 운동 카테고리 신설에 따른 legacy 정리)
 *
 * 판정 신호 = 매장명 + 그 매장의 모든 캠페인 content (신규 수집 분류 _scrape.js와 동일 규칙).
 * 여가성(낚시·승마·다이빙·서핑·수영·볼링·당구·크루즈)은 제외 → '기타' 유지.
 *
 * 미리보기(읽기전용): node scripts/sweep-fitness-category.js
 * 적용:              node scripts/sweep-fitness-category.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { categoryByKeyword } = require('../api/_scrape');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');

// 신규 수집과 동일 규칙(categoryByKeyword)이 '운동'으로 판정하는 매장만 대상 → 규칙 드리프트 방지.
const isGym = (s, name) => categoryByKeyword(s, name) === '운동';

(async () => {
  // 기타 매장 + 캠페인 content 집계
  const rows = (await db.execute(
    `SELECT p.id AS id, p.name AS name, GROUP_CONCAT(COALESCE(c.content,''), ' § ') AS contents
     FROM places p LEFT JOIN campaigns c ON c.place_id = p.id
     WHERE p.category = '기타'
     GROUP BY p.id`
  )).rows;

  const hits = [];
  for (const r of rows) {
    const s = String(r.name || '') + ' ' + String(r.contents || '');
    if (isGym(s, String(r.name || ''))) hits.push({ id: r.id, name: r.name });
  }

  console.log(`기타 매장: ${rows.length}건`);
  console.log(`→ '운동'으로 재분류 대상: ${hits.length}건`);
  console.log('--- 샘플 30 ---');
  hits.slice(0, 30).forEach(h => console.log(`  #${h.id}  ${h.name}`));

  if (!APPLY) { console.log('\n[미리보기] 적용하려면 --apply'); return; }

  let done = 0;
  const CHUNK = 200;
  for (let i = 0; i < hits.length; i += CHUNK) {
    const ids = hits.slice(i, i + CHUNK).map(h => h.id);
    const ph = ids.map(() => '?').join(',');
    const r = await db.execute({ sql: `UPDATE places SET category='운동' WHERE category='기타' AND id IN (${ph})`, args: ids });
    done += Number(r.rowsAffected || 0);
    console.log(`  ...${Math.min(i + CHUNK, hits.length)}/${hits.length} (누적 변경 ${done})`);
  }
  console.log(`\n[적용완료] ${done}건 '운동'으로 변경`);
})().catch(e => { console.error(e); process.exit(1); });
