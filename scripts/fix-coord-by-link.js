#!/usr/bin/env node
/**
 * 네이버 지도 링크로 위치오류 매장 좌표 정정.
 *   node scripts/fix-coord-by-link.js https://naver.me/xxxx
 * 링크의 장소명으로 '위치오류' 신고 목록에서 매장을 찾아 좌표 UPDATE + 신고 삭제.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const norm = (s) => (s || '').replace(/\s/g, '');

async function resolveLink(url) {
  const resolved = (await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })).url;
  const pid = (resolved.match(/place\/(\d+)/) || [])[1]; if (!pid) return null;
  const page = await (await fetch('https://m.place.naver.com/place/' + pid + '/home', { headers: { 'User-Agent': UA } })).text();
  const mm = page.match(/"x":"(12[0-9]\.[0-9]{4,})","y":"(3[0-9]\.[0-9]{4,})"/) || page.match(/"y":"(3[0-9]\.[0-9]{4,})","x":"(12[0-9]\.[0-9]{4,})"/);
  if (!mm) return null;
  const xy = mm[1].startsWith('12');
  const nm = (page.match(/"name":"([^"]{1,30})"/) || [])[1];
  const road = (page.match(/"roadAddress":"([^"]{1,60})"/) || page.match(/"address":"([^"]{1,60})"/) || [])[1];
  return { lng: Number(xy ? mm[1] : mm[2]), lat: Number(xy ? mm[2] : mm[1]), name: nm, road };
}

(async () => {
  const url = process.argv[2];
  if (!url) { console.log('사용: node scripts/fix-coord-by-link.js <naver.me 링크>'); return; }
  const c = await resolveLink(url);
  if (!c) { console.log('좌표 해석 실패'); return; }
  console.log(`네이버 장소: ${c.name} | ${c.road} | 좌표 ${c.lat}, ${c.lng}`);
  const reps = (await db.execute("SELECT r.place_id, p.name, p.address, p.lat, p.lng FROM reports r JOIN places p ON p.id=r.place_id WHERE r.reason LIKE '위치오류%'")).rows;
  const hit = reps.find((x) => c.name && (norm(x.name).includes(norm(c.name)) || norm(c.name).includes(norm(x.name))));
  if (!hit) { console.log('⚠️ 이름 매칭 실패. 남은:', reps.map((r) => r.name).join(', ')); return; }
  await db.execute({ sql: 'UPDATE places SET lat=?, lng=? WHERE id=?', args: [c.lat, c.lng, hit.place_id] });
  await db.execute({ sql: "DELETE FROM reports WHERE place_id=? AND reason LIKE '위치오류%'", args: [hit.place_id] });
  const left = (await db.execute("SELECT p.name FROM reports r JOIN places p ON p.id=r.place_id WHERE r.reason LIKE '위치오류%'")).rows.map((r) => r.name);
  console.log(`✅ ${hit.name} 정정 완료 (${Number(hit.lat).toFixed(3)},${Number(hit.lng).toFixed(3)} → ${c.lat.toFixed(3)},${c.lng.toFixed(3)}) + 신고 정리`);
  console.log(`남은 ${left.length}곳: ${left.join('·')}`);
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
