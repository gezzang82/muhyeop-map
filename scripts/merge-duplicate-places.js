// 같은이름(공백무시)+같은좌표(±50m) 중복 매장 병합 (운영, TURSO_PROD_*).
// 캠페인 많은 쪽을 원본으로, 나머지 캠페인/후기/신고를 이관 후 중복 삭제.
// ⚠️ '같은 이름'까지 일치할 때만(좌표만으론 같은 건물 다른 가게 오탐). 이름 오염 정리(cleanStoreName 스윕) 후 실행 권장.
// 사용: node scripts/merge-duplicate-places.js        (DRY)
//       node scripts/merge-duplicate-places.js apply  (실제 병합)
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const APPLY = process.argv[2] === 'apply';
const nkey = s => String(s || '').replace(/\s+/g, '').toLowerCase();
(async () => {
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });
  const rows = (await db.execute("SELECT id,name,lat,lng FROM places WHERE COALESCE(hidden,0)=0")).rows;
  const cc = {}; (await db.execute("SELECT place_id,COUNT(*) n FROM campaigns GROUP BY place_id")).rows.forEach(r => cc[r.place_id] = Number(r.n || 0));
  const rc = {}; (await db.execute("SELECT place_id,COUNT(*) n FROM reviews GROUP BY place_id")).rows.forEach(r => rc[r.place_id] = Number(r.n || 0));
  const byName = {}; rows.forEach(p => { const k = nkey(p.name); if (k) (byName[k] = byName[k] || []).push(p); });
  const merges = [];
  for (const k in byName) {
    const arr = byName[k]; if (arr.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < arr.length; i++) {
      if (used.has(arr[i].id)) continue;
      const cl = [arr[i]];
      for (let j = i + 1; j < arr.length; j++) { if (used.has(arr[j].id)) continue; if (Math.abs(arr[i].lat - arr[j].lat) < 0.0006 && Math.abs(arr[i].lng - arr[j].lng) < 0.0006) { cl.push(arr[j]); used.add(arr[j].id); } }
      if (cl.length > 1) { cl.sort((a, b) => ((cc[b.id] || 0) + (rc[b.id] || 0)) - ((cc[a.id] || 0) + (rc[a.id] || 0)) || a.id - b.id); merges.push({ keep: cl[0], drop: cl.slice(1) }); }
    }
  }
  console.log(`${APPLY ? 'APPLY' : 'DRY'} | 병합 그룹 ${merges.length}, 삭제 ${merges.reduce((s, m) => s + m.drop.length, 0)}`);
  if (APPLY) {
    for (const m of merges) for (const d of m.drop) {
      await db.execute({ sql: "UPDATE campaigns SET place_id=? WHERE place_id=?", args: [m.keep.id, d.id] });
      await db.execute({ sql: "UPDATE reviews SET place_id=? WHERE place_id=?", args: [m.keep.id, d.id] }).catch(() => {});
      await db.execute({ sql: "UPDATE reports SET place_id=? WHERE place_id=?", args: [m.keep.id, d.id] }).catch(() => {});
      await db.execute({ sql: "DELETE FROM places WHERE id=?", args: [d.id] });
    }
    console.log('병합 완료');
  }
})().catch(e => console.error('ERR', e.message));
