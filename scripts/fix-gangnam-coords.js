#!/usr/bin/env node
/**
 * 강남맛집 좌표오류 정정 — 주소 시도 ↔ 좌표가 어긋난 강남맛집 매장을,
 * 상세의 네이버 플레이스 링크(naver.me → m.place)에서 정확좌표를 뽑아 교정.
 * (이름이 흔해 지역검색 지오코딩이 실패한 케이스용. 주소는 이미 정확)
 *
 * 미리보기: node scripts/fix-gangnam-coords.js         (20건)
 * 전체적용: node scripts/fix-gangnam-coords.js --apply
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 시도 대략 박스(주소↔좌표 불일치 판별) — scan-location.js와 동일
const BOX = { 서울: [37.40, 37.73, 126.73, 127.22], 인천: [37.28, 37.82, 125.50, 126.83], 경기: [36.88, 38.32, 126.48, 127.68], 부산: [34.92, 35.42, 128.73, 129.32], 대구: [35.62, 36.08, 128.32, 128.82], 광주: [35.03, 35.30, 126.68, 127.02], 대전: [36.15, 36.52, 127.28, 127.58], 울산: [35.42, 35.82, 129.02, 129.50], 세종: [36.42, 36.78, 127.18, 127.42], 강원: [37.00, 38.67, 127.55, 129.42], 충북: [35.98, 37.28, 127.33, 128.13], 충남: [35.95, 37.08, 126.08, 127.58], 전북: [35.33, 36.12, 126.38, 127.58], 전남: [34.05, 35.52, 125.85, 127.65], 경북: [35.62, 37.12, 128.02, 129.63], 경남: [34.52, 35.95, 127.52, 129.28], 제주: [33.08, 33.62, 126.08, 127.00] };
function sidoOf(addr) {
  const a = (addr || '').trim();
  const map = [[/^서울/, '서울'], [/^인천/, '인천'], [/^경기/, '경기'], [/^부산/, '부산'], [/^대구/, '대구'], [/^광주/, '광주'], [/^대전/, '대전'], [/^울산/, '울산'], [/^세종/, '세종'], [/^강원/, '강원'], [/^제주/, '제주'], [/^충청?북도?|^충북/, '충북'], [/^충청?남도?|^충남/, '충남'], [/^전라?북도?|^전북/, '전북'], [/^전라?남도?|^전남/, '전남'], [/^경상?북도?|^경북/, '경북'], [/^경상?남도?|^경남/, '경남']];
  for (const [re, key] of map) if (re.test(a)) return key;
  return null;
}
const inBox = (k, lat, lng) => { const b = BOX[k]; return b && lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]; };

// 강남맛집 상세 → naver.me → m.place 좌표
async function coordsFromPlaceLink(cpId) {
  const html = await (await fetch(`https://xn--939au0g4vj8sq.net/cp/?id=${cpId}`, { headers: { 'User-Agent': UA } })).text();
  const nv = (html.match(/https?:\/\/naver\.me\/[A-Za-z0-9]+/) || [])[0];
  if (!nv) return null;
  const resolved = (await fetch(nv, { headers: { 'User-Agent': UA }, redirect: 'follow' })).url;
  const pid = (resolved.match(/place\/(\d+)/) || [])[1];
  if (!pid) return null;
  const page = await (await fetch(`https://m.place.naver.com/place/${pid}/home`, { headers: { 'User-Agent': UA } })).text();
  const m = page.match(/"x":"(12[0-9]\.[0-9]{4,})","y":"(3[0-9]\.[0-9]{4,})"/) || page.match(/"y":"(3[0-9]\.[0-9]{4,})","x":"(12[0-9]\.[0-9]{4,})"/);
  if (!m) return null;
  const isXY = m[1].startsWith('12');
  return { lng: Number(isXY ? m[1] : m[2]), lat: Number(isXY ? m[2] : m[1]) };
}

(async () => {
  const rows = (await db.execute(`
    SELECT p.id, p.name, p.address, p.lat, p.lng, MIN(c.link) link
    FROM campaigns c JOIN places p ON p.id = c.place_id
    WHERE c.link LIKE '%xn--939au%' GROUP BY p.id`)).rows;
  // 주소 시도 ↔ 좌표 불일치만
  const bad = rows.filter((r) => { const k = sidoOf(r.address); return k && !inBox(k, Number(r.lat), Number(r.lng)); });
  const LIMIT = APPLY ? bad.length : Math.min(20, bad.length);
  console.log(`강남맛집 좌표오류(주소↔좌표 불일치): ${bad.length}건 (${APPLY ? '전체 적용' : `미리보기 ${LIMIT}`})\n`);
  let fixed = 0, fail = 0, err = 0;
  for (let i = 0; i < LIMIT; i++) {
    const r = bad[i];
    try {
      const cpId = (String(r.link).match(/id=(\d+)/) || [])[1];
      const c = cpId ? await coordsFromPlaceLink(cpId) : null;
      await sleep(150);
      if (!c) { fail++; console.log(`  ✗ ${r.name} | ${r.address} → 플레이스 좌표 못얻음`); continue; }
      fixed++;
      if (i < 20 || !APPLY) console.log(`  ✔ ${r.name} | ${r.address}\n     ${Number(r.lat).toFixed(4)},${Number(r.lng).toFixed(4)} → ${c.lat.toFixed(4)},${c.lng.toFixed(4)}`);
      if (APPLY) await db.execute({ sql: 'UPDATE places SET lat=?, lng=? WHERE id=?', args: [c.lat, c.lng, r.id] });
    } catch (e) { err++; }
    if (i % 50 === 0 && i) console.log(`  … ${i}/${LIMIT} (정정 ${fixed})`);
  }
  console.log(`\n좌표정정 ${fixed} · 실패 ${fail} · 오류 ${err}` + (APPLY ? ' — 적용완료' : ' (--apply)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
