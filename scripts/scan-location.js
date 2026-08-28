#!/usr/bin/env node
/**
 * 위치 전수 검사 — 매장 주소의 시도(광역) ↔ 저장 좌표가 어긋난 매장을 색출.
 * (예: 주소는 경남 양산인데 좌표는 전북 산속 = 지오코딩 오류)
 *
 * 1) 각 매장 주소에서 시도를 뽑아, 좌표가 그 시도 bounding box 밖이면 "후보"
 * 2) 후보만 네이버 로컬검색으로 재조회 → 주소가 일치하는 정답 좌표 + 거리 계산
 * 3) 미리보기: node scripts/scan-location.js   /  정정 적용: node scripts/scan-location.js --apply
 *
 * ⚠️ --apply는 운영 DB의 places.lat/lng를 실제 UPDATE 한다.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 시도 대략 bounding box [latMin, latMax, lngMin, lngMax] — 넉넉하게(경계 오탐 최소화), 명백히 다른 시도만 후보로.
const BOX = {
  서울: [37.40, 37.73, 126.73, 127.22],
  인천: [37.28, 37.82, 125.50, 126.83], // 본토+영종+강화+옹진섬
  경기: [36.88, 38.32, 126.48, 127.68],
  부산: [34.92, 35.42, 128.73, 129.32],
  대구: [35.62, 36.08, 128.32, 128.82],
  광주: [35.03, 35.30, 126.68, 127.02],
  대전: [36.15, 36.52, 127.28, 127.58],
  울산: [35.42, 35.82, 129.02, 129.50],
  세종: [36.42, 36.78, 127.18, 127.42],
  강원: [37.00, 38.67, 127.55, 129.42],
  충북: [35.98, 37.28, 127.33, 128.13],
  충남: [35.95, 37.08, 126.08, 127.58],
  전북: [35.33, 36.12, 126.38, 127.58],
  전남: [34.05, 35.52, 125.85, 127.65],
  경북: [35.62, 37.12, 128.02, 129.63],
  경남: [34.52, 35.95, 127.52, 129.28],
  제주: [33.08, 33.62, 126.08, 127.00],
};
// 주소 접두어 → 표준 시도키
function sidoOf(addr) {
  const a = (addr || '').trim();
  const map = [
    [/^서울/, '서울'], [/^인천/, '인천'], [/^경기/, '경기'], [/^부산/, '부산'],
    [/^대구/, '대구'], [/^광주/, '광주'], [/^대전/, '대전'], [/^울산/, '울산'],
    [/^세종/, '세종'], [/^강원/, '강원'], [/^제주/, '제주'],
    [/^충청?북도?|^충북/, '충북'], [/^충청?남도?|^충남/, '충남'],
    [/^전라?북도?|^전북/, '전북'], [/^전라?남도?|^전남/, '전남'],
    [/^경상?북도?|^경북/, '경북'], [/^경상?남도?|^경남/, '경남'],
  ];
  for (const [re, key] of map) if (re.test(a)) return key;
  return null;
}
const inBox = (key, lat, lng) => { const b = BOX[key]; return lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3]; };
function distM(a1, o1, a2, o2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (a2 - a1) * r, dLng = (o2 - o1) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
async function naver(q) {
  const url = 'https://openapi.naver.com/v1/search/local.json?query=' + encodeURIComponent(q) + '&display=5';
  const r = await fetch(url, { headers: { 'X-Naver-Client-Id': process.env.NAVER_SEARCH_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_SEARCH_CLIENT_SECRET } });
  return (await r.json()).items || [];
}
const strip = (s) => (s || '').replace(/<[^>]+>/g, '');

(async () => {
  const rows = (await db.execute('SELECT id, name, address, lat, lng FROM places')).rows;
  console.log('전체 매장:', rows.length);
  const noSido = rows.filter((p) => !sidoOf(p.address));
  const suspects = rows.filter((p) => { const k = sidoOf(p.address); return k && !inBox(k, Number(p.lat), Number(p.lng)); });
  console.log('시도 판별 불가(주소형식 특이):', noSido.length, '· 시도-좌표 불일치 후보:', suspects.length, '\n');

  const fixes = [];
  for (const p of suspects) {
    const key = sidoOf(p.address);
    // 주소 앞부분(시도 시군구 동)으로 네이버 재조회
    const toks = p.address.split(/\s+/).slice(0, 3).join(' ');
    let items = [];
    try { items = await naver(p.name + ' ' + toks); } catch { /* skip */ }
    await sleep(230);
    // 정답 후보: 이름 유사 + 주소 시도 일치
    const norm = (s) => strip(s).replace(/\s+/g, '');
    const cand = items.find((it) => sidoOf(strip(it.roadAddress) || strip(it.address)) === key);
    const line = `#${p.id} ${p.name} | 주소:${p.address} (${key}) | 좌표 ${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`;
    if (!cand) { console.log('  ✗ ' + line + ' → 네이버 매칭 실패(수동확인)'); continue; }
    const nlat = Number(cand.mapy) / 1e7, nlng = Number(cand.mapx) / 1e7;
    const d = Math.round(distM(Number(p.lat), Number(p.lng), nlat, nlng));
    console.log(`  ✔ ${line}\n     → ${nlat.toFixed(4)},${nlng.toFixed(4)} (${strip(cand.roadAddress) || strip(cand.address)}) · ${d}m 이동`);
    fixes.push({ id: p.id, lat: nlat, lng: nlng, d });
  }
  console.log(`\n정정 가능: ${fixes.length}건`);
  if (APPLY) {
    for (const f of fixes) await db.execute({ sql: 'UPDATE places SET lat=?, lng=? WHERE id=?', args: [f.lat, f.lng, f.id] });
    console.log('— 적용 완료(UPDATE)');
  } else {
    console.log('(--apply 로 반영)');
  }
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
