#!/usr/bin/env node
/**
 * 승인대기(AI 과보류) 중 '진짜 매장'을 지오코딩 성공 시 일괄 승인 등록.
 * 기본 대상: 카테고리 오지정 버킷(auto_note LIKE '%카테고리%'). --bucket 로 변경.
 *
 * 미리보기: node scripts/approve-real-pending.js
 * 적용:     node scripts/approve-real-pending.js --apply
 *   버킷:   --bucket=category | delivery | spam   (기본 category)
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { geocodeServer, inKorea } = require('../api/_geocode');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes('--apply');
const bucket = (process.argv.find((a) => a.startsWith('--bucket=')) || '--bucket=category').split('=')[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (s) => JSON.stringify(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));

const WHERE = {
  category: "auto_note LIKE '%카테고리%'",
  delivery: "auto_note LIKE '%배송형%'",
  spam: "(auto_note LIKE '%스팸%' OR auto_note LIKE '%의미 없%')",
};
// 카테고리 판정: ① AI note 명시 추출 → ② 키워드 분류 → ③ 기존값.
function catFrom(note, cur, content, name) {
  const m = (note || '').match(/올바른 카테고리는\s*([가-힣A-Za-z\/]+)/) || (note || '').match(/실제로는\s*([가-힣]{2,})\s*(?:시설|업|점)/);
  if (m) { const c = m[1].replace(/(시설|입니다|이고|이며|이므로|매장|으로|로)$/, '').trim(); if (c && c !== '음식점') return c; }
  const s = (name || '') + ' ' + (content || '') + ' ' + (note || '');
  if (/세차/.test(s)) return '세차';
  if (/펜션|풀빌라|숙박|호텔|모텔|글램핑|캠핑|촌집|한옥/.test(s)) return '숙박';
  if (/안경|선글라스|렌즈/.test(s)) return '안경';
  if (/세탁|빨래|드라이클리닝/.test(s)) return '세탁';
  if (/네일|왁싱|피부|헤어|미용|에스테틱|마사지|태닝|속눈썹|반영구|필러|보톡스|타투|두피|체형|다이어트|스킨케어/.test(s)) return '뷰티';
  if (/타로|사주|철학|운세|점집/.test(s)) return '운세';
  if (/변호사|법률|세무|회계|노무|법무/.test(s)) return '전문서비스';
  if (/애견|반려|펫|파충류|동물|강아지|고양이/.test(s)) return '반려동물';
  if (/케이크|디저트|베이커리|커피|브런치|룸카페|스터디카페|카페|빙수/.test(s)) return '카페';
  if (/식사|맛집|고기|초밥|스시|국밥|치킨|피자|족발|막국수|국수|뷔페|식당|한우|횟집|삼겹|곱창|보쌈|덮밥|찌개|분식|포차|이자카야|한식|중식|일식|양식/.test(s)) return '음식점';
  return cur || '기타';
}
async function insertPlace(r, lat, lng, category) {
  const dup = await db.execute({ sql: "SELECT id FROM places WHERE REPLACE(name,' ','')=REPLACE(?,' ','') AND ABS(lat-?)<0.0007 AND ABS(lng-?)<0.0007 LIMIT 1", args: [r.name, lat, lng] });
  if (dup.rows.length) return Number(dup.rows[0].id);
  const ins = await db.execute({ sql: "INSERT INTO places (name,address,lat,lng,category,founder_nickname,founder_email,founder_url,founder_user_id) VALUES (?,?,?,?,?,'','','',NULL)", args: [r.name, r.address || '', lat, lng, category] });
  return Number(ins.lastInsertRowid);
}
async function insertCampaign(placeId, r) {
  if (r.source_url) { const d = await db.execute({ sql: 'SELECT id FROM campaigns WHERE link=? LIMIT 1', args: [r.source_url] }); if (d.rows.length) return Number(d.rows[0].id); }
  const ins = await db.execute({ sql: `INSERT INTO campaigns (place_id,platform,channels,content,deadline,link,operating_days,operating_hours,exclude_holiday,reporter_nickname,reporter_email,reporter_blog,reporter_instagram,reporter_url,source,user_id) VALUES (?,?,?,?,?,?,?,?,?,'','','','','','ai',NULL)`, args: [placeId, r.platform || '', csv(r.channel), r.content || '', r.deadline || '', r.source_url || '', csv(r.days), r.hours || '', r.exclude_holiday ? 1 : 0] });
  return Number(ins.lastInsertRowid);
}

(async () => {
  const rows = (await db.execute(`SELECT id,platform,source_id,source_url,name,address,category,channel,content,deadline,hours,days,exclude_holiday,auto_note FROM scraped_items WHERE status='pending' AND ${WHERE[bucket]}`)).rows;
  const LIMIT = APPLY ? rows.length : Math.min(10, rows.length);
  console.log(`[${bucket}] 승인대기: ${rows.length}건 (${APPLY ? '전체 적용' : `미리보기 ${LIMIT}`})\n`);
  let reg = 0, geoFail = 0, err = 0;
  for (let i = 0; i < LIMIT; i++) {
    const r = rows[i];
    try {
      const geo = await geocodeServer({ name: r.name, address: r.address }).catch(() => null);
      await sleep(90);
      if (!geo || !inKorea(geo.lat, geo.lng)) { geoFail++; if (!APPLY) console.log(`  ✗ ${r.name} (${r.address}) → 지오코딩 실패`); continue; }
      const cat = catFrom(r.auto_note, r.category, r.content, r.name);
      reg++;
      if (i < 12 || !APPLY) console.log(`  ✔ ${r.name} | ${r.address} → ${geo.lat.toFixed(4)},${geo.lng.toFixed(4)} | 카테고리:${cat}`);
      if (APPLY) {
        const pid = await insertPlace(r, geo.lat, geo.lng, cat);
        const cid = await insertCampaign(pid, r);
        await db.execute({ sql: "UPDATE scraped_items SET status='registered', created_campaign_id=?, auto_seen=1, auto_note=?, reviewed_at=datetime('now','+9 hours') WHERE id=?", args: [cid, '일괄승인(' + bucket + ')', r.id] });
      }
    } catch (e) { err++; }
    if (i % 50 === 0 && i) console.log(`  … ${i}/${LIMIT} (등록 ${reg} · 지오실패 ${geoFail})`);
  }
  console.log(`\n등록 ${reg} · 지오실패 ${geoFail}(잔류) · 오류 ${err}` + (APPLY ? ' — 적용완료' : ' (--apply)'));
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
