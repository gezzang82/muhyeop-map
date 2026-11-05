#!/usr/bin/env node
// 검수큐(scraped_items status='pending', auto_seen=1) Phase2 판별/정리.
//  원칙 "네이버 매장명 기준"을 필터로 사용:
//   ① 주소 지오코딩 → ② 기존 매장 ±50m 이름매칭 있으면 중복=그 매장에 캠페인만 추가(재사용)
//   ③ 없으면 네이버 지역검색 정식명 확인 → 걸리면 신규지점 등록(정식명+네이버 카테고리) / 안 걸리면 비매장=스킵
//   지오코딩 실패 → reparse 버킷(보존). 채널 없음 → 등록불가(보존).
//  검증된 _autopilot.insertPlace/insertCampaign(네이버 정규화+좌표 dedup 내장)을 그대로 재사용.
//  ⚠️ 운영 DB 직접 쓰기 — TURSO_PROD_* 사용. DRY가 기본, --go 로만 실제 등록/스킵.
//  사용: node scripts/phase2-curate.cjs [--go] [--limit N]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });

const { createClient } = require(path.join(ROOT, 'node_modules/@libsql/client'));
const { insertPlace, insertCampaign, markRegistered, naverCanonicalName } = require(path.join(ROOT, 'api/_autopilot'));
const { geocodeServer } = require(path.join(ROOT, 'api/_geocode'));

const GO = process.argv.includes('--go');
const limArg = process.argv.indexOf('--limit');
const LIMIT = limArg >= 0 ? Number(process.argv[limArg + 1]) : (GO ? 40 : 0);
const url = process.env.TURSO_PROD_URL, authToken = process.env.TURSO_PROD_AUTH_TOKEN;
if (!url || /dev\.db|file:/.test(url)) { console.error('⚠️ 운영 DB가 아님:', url); process.exit(1); }
const db = createClient({ url, authToken });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const csv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

// insertPlace의 findHit와 동일: 같은 50m 안 이름 포함관계(짧은쪽 4자+)면 동일매장
async function nearbyHit(name, lat, lng) {
  const near = await db.execute({
    sql: 'SELECT id, name FROM places WHERE lat > ? AND lat < ? AND lng > ? AND lng < ?',
    args: [lat - 0.0007, lat + 0.0007, lng - 0.0007, lng + 0.0007],
  });
  const key = String(name).replace(/ /g, '');
  const hit = near.rows.find((p) => {
    const pk = String(p.name).replace(/ /g, '');
    if (pk === key) return true;
    const sh = pk.length <= key.length ? pk : key, lo = pk.length <= key.length ? key : pk;
    return sh.length >= 4 && lo.includes(sh);
  });
  return hit ? Number(hit.id) : null;
}

(async () => {
  // 대상: pending + 미래마감(or 상시) — 채널 유무로 1차 분류
  const rows = (await db.execute(
    "SELECT * FROM scraped_items WHERE status='pending' AND (deadline='' OR deadline IS NULL OR deadline >= ?) ORDER BY id ASC",
    [today]
  )).rows;
  const withCh = rows.filter(r => csv(r.channel).length);
  const noCh = rows.length - withCh.length;
  console.log(`=== Phase2 판별 ${GO ? '(실행)' : '(DRY)'} ===`);
  console.log(`유효 pending: ${rows.length} | 등록후보(채널有): ${withCh.length} | 채널無(보존): ${noCh}`);
  if (!GO) {
    console.log('\n[등록후보 샘플 10]');
    withCh.slice(0, 10).forEach(r => console.log(`  [${r.platform}] ${r.name} | ${(r.address||'').slice(0,34)} | ${r.category} | ${(r.auto_note||'').slice(0,22)}`));
    console.log('\n실행: node scripts/phase2-curate.cjs --go --limit 40');
    return;
  }

  const target = LIMIT > 0 ? withCh.slice(0, LIMIT) : withCh;
  const b = { register: 0, reuse: 0, skipNaver: 0, reparse: 0, err: 0 };
  const skipSamples = [];
  for (const r of target) {
    try {
      const geo = await geocodeServer({ name: r.name, address: r.address });
      if (!geo || !isFinite(geo.lat) || !isFinite(geo.lng)) { b.reparse++; continue; } // 좌표 실패 → 보존(reparse 대상)
      const hit = await nearbyHit(r.name, geo.lat, geo.lng);
      let proceed = false, reuse = false;
      if (hit) { proceed = true; reuse = true; }
      else {
        const canon = await naverCanonicalName(r.name, geo.lat, geo.lng); // 네이버 정식명 확인(비매장 필터)
        if (canon) proceed = true;
      }
      if (!proceed) {
        b.skipNaver++;
        if (skipSamples.length < 15) skipSamples.push(`${r.name} | ${(r.address||'').slice(0,30)}`);
        continue; // 네이버 미검출 = 비매장 의심 → 보존(스킵, 등록 안 함)
      }
      // 등록(검증된 경로: insertPlace가 정식명 정규화+좌표 dedup 재수행)
      const placeId = await insertPlace(db, { name: r.name, address: r.address, lat: geo.lat, lng: geo.lng, category: r.category || '기타' });
      const cid = await insertCampaign(db, placeId, r, r.category || '기타');
      await markRegistered(db, r.id, cid, 'Phase2판별: ' + (reuse ? '기존매장 재사용' : '네이버 정식명 확인'));
      if (reuse) b.reuse++; else b.register++;
      await sleep(180); // 네이버 API 레이트리밋 + 크롤러 동시실행 배려
    } catch (e) { b.err++; if (skipSamples.length < 15) skipSamples.push(`ERR ${r.name}: ${e.message.slice(0,40)}`); }
  }
  console.log(`\n처리: ${target.length}건`);
  console.log(`  🟢 신규등록: ${b.register} | 🔵 기존매장 캠페인추가: ${b.reuse}`);
  console.log(`  ⚪ 네이버 미검출 스킵(보존): ${b.skipNaver} | 🟡 좌표실패 reparse(보존): ${b.reparse} | ❌ 에러: ${b.err}`);
  if (skipSamples.length) { console.log('\n[스킵/에러 샘플]'); skipSamples.forEach(s => console.log('  - ' + s)); }
  const remain = (await db.execute("SELECT COUNT(*) AS n FROM scraped_items WHERE status='pending'")).rows[0].n;
  console.log('\n남은 pending:', remain);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
