#!/usr/bin/env node
/**
 * 강남맛집 주소 백필 — 지역만("서울 중구") 등록된 매장을 상세에서 정확주소 뽑아 재지오코딩.
 * 캠페인 요일/공휴일도 상세(cmp_guide)에서 파싱해 함께 채운다.
 *
 * 미리보기: node scripts/backfill-gangnam.js         (기본 30건만, 쓰기 없음)
 * 전체적용: node scripts/backfill-gangnam.js --apply  (지역만 주소 전량)
 *
 * ⚠️ --apply는 places.address/lat/lng, campaigns.operating_days/exclude_holiday를 실제 UPDATE.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { gnScrapeDetail } = require('../api/_scrape');
const { geocodeServer } = require('../api/_geocode');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRegionOnly = (a) => !/[0-9]/.test(a || '') && !/(동|로|길|읍|면|가)\b/.test(a || '');
const toArr = (s) => JSON.stringify(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));

(async () => {
  // 강남맛집 매장별 대표 캠페인(source id) + 그 매장의 강남맛집 캠페인 전체 id
  const rows = (await db.execute(`
    SELECT p.id pid, p.name, p.address, p.lat, p.lng, c.id cid, c.link
    FROM campaigns c JOIN places p ON p.id = c.place_id
    WHERE c.link LIKE '%xn--939au%'`)).rows;
  const byPlace = new Map();
  for (const r of rows) {
    if (!byPlace.has(r.pid)) byPlace.set(r.pid, { pid: r.pid, name: r.name, address: r.address, lat: r.lat, lng: r.lng, campIds: [], srcId: null });
    const p = byPlace.get(r.pid); p.campIds.push(r.cid);
    const idm = String(r.link).match(/id=(\d+)/); if (idm && !p.srcId) p.srcId = idm[1];
  }
  const targets = [...byPlace.values()].filter((p) => isRegionOnly(p.address) && p.srcId);
  const LIMIT = APPLY ? targets.length : Math.min(30, targets.length);
  console.log(`강남맛집 지역만-주소 매장: ${targets.length}건 (${APPLY ? '전체 적용' : `미리보기 ${LIMIT}건`})\n`);
  let fixedAddr = 0, fixedCoord = 0, fixedDays = 0, geoFail = 0, noAddr = 0, err = 0;
  for (let i = 0; i < LIMIT; i++) {
    const p = targets[i];
    try {
      const d = await gnScrapeDetail(p.srcId, p.name);
      await sleep(100);
      if (!d.address || isRegionOnly(d.address)) { noAddr++; continue; }
      const geo = await geocodeServer({ name: p.name, address: d.address }).catch(() => null);
      await sleep(100);
      const daysArr = toArr(d.days);
      fixedAddr++;
      if (geo) fixedCoord++; else { geoFail++; console.log(`  ✗ ${p.name} | ${d.address} → 지오코딩 실패(주소만 교정)`); }
      if (APPLY) {
        // 지오 성공: 주소+좌표, 실패: 주소만(좌표 유지)
        if (geo) await db.execute({ sql: 'UPDATE places SET address=?, lat=?, lng=? WHERE id=?', args: [d.address, geo.lat, geo.lng, p.pid] });
        else await db.execute({ sql: 'UPDATE places SET address=? WHERE id=?', args: [d.address, p.pid] });
        if (d.days) { await db.execute({ sql: `UPDATE campaigns SET operating_days=?, exclude_holiday=? WHERE id IN (${p.campIds.map(() => '?').join(',')})`, args: [daysArr, d.excludeHoliday || 0, ...p.campIds] }); fixedDays++; }
      } else if (d.days) fixedDays++;
    } catch (e) { err++; }
    if (i % 100 === 0 && i) console.log(`  … ${i}/${LIMIT} (주소 ${fixedAddr} · 좌표 ${fixedCoord} · 요일 ${fixedDays} · 오류 ${err})`);
  }
  console.log(`\n주소정정 ${fixedAddr}(좌표 ${fixedCoord}) · 요일채움 ${fixedDays} · 지오실패 ${geoFail} · 주소못얻음 ${noAddr} · 오류 ${err}` + (APPLY ? ' — 적용 완료' : ' (--apply로 전체 반영)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
