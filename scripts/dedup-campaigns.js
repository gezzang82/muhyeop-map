#!/usr/bin/env node
/**
 * 중복 캠페인 정리 — 같은 매장+채널+링크로 2개 이상 등록된 캠페인의 초과분 삭제(가장 먼저 만든 것만 유지).
 * 서버/로컬 오토파일럿 동시 실행으로 생겼던 중복 정리용. link 있는(수집분)만 대상, source=user는 건드리지 않음.
 *
 * 미리보기:  node scripts/dedup-campaigns.js
 * 실제 삭제:  node scripts/dedup-campaigns.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');

(async () => {
  const ids = (await db.execute(
    "SELECT c.id FROM campaigns c WHERE c.link!='' AND c.source!='user' " +
    "AND EXISTS(SELECT 1 FROM campaigns c2 WHERE c2.place_id=c.place_id AND c2.channels=c.channels AND c2.link=c.link AND c2.id<c.id)"
  )).rows.map(r => r.id);
  console.log('중복 초과분 캠페인:', ids.length, '건');
  if (!APPLY) { console.log('[미리보기] 실제로 지우려면: node scripts/dedup-campaigns.js --apply'); return; }
  let del = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100); const ph = chunk.map(() => '?').join(',');
    const r = await db.execute({ sql: 'DELETE FROM campaigns WHERE id IN (' + ph + ')', args: chunk });
    del += r.rowsAffected || 0;
  }
  console.log('✅ 삭제 완료:', del, '건');
  const left = (await db.execute("SELECT COUNT(*) g FROM (SELECT COUNT(*) n FROM campaigns WHERE link!='' GROUP BY place_id,channels,link HAVING n>1)")).rows[0].g;
  console.log('남은 중복 그룹:', left, '(0이어야 정상)');
})().catch(e => { console.error('오류:', e.message); process.exit(1); });
