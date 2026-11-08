// 네이버 카테고리 전수 재분류 스윕 (운영, TURSO_PROD_*).
//  대상 매장을 네이버 지역검색으로 재조회 → mapNaverCat 재적용 → 카테고리 교정.
//  분류 원칙 = "네이버 카테고리 기준"(이름 키워드 추측 금지, 2026-11-01 결정). 기존 숙박/여가 전수검사와 동일 계열.
//
// ⚠️ 보수적 게이트(오매칭 방지): 네이버 결과가 ①이름 정규화 일치(한쪽이 다른쪽 포함) AND ②주소 시군구 일치 AND
//    ③한국 좌표 인 것만 채택. 그 결과의 네이버 category를 mapNaverCat로 매핑해 현재와 다르면 교정 후보.
//    미매칭·지역불일치·매핑 불명(기타)로 현재와 같음 → 스킵(현행 유지). 되돌릴 수 있게 DRY 기본.
//
// 사용:
//   node scripts/sweep-naver-category.js                     (DRY, 대상=category '기타' 전체)
//   node scripts/sweep-naver-category.js cat=카페            (DRY, 특정 카테고리 대상)
//   node scripts/sweep-naver-category.js namelike=안마의자   (DRY, 이름 LIKE '%안마의자%' 대상 — 힐링카페 교정용)
//   node scripts/sweep-naver-category.js limit=100           (앞 100건만 — 테스트)
//   node scripts/sweep-naver-category.js cat=기타 apply      (실제 UPDATE)
//
// 네이버 쿼터: 매장당 지역검색 1~2회. 수천 건이면 호출 간 딜레이(THROTTLE_MS)로 분산. 429/5xx는 백오프 재시도.
//   서버/앱 부하 없음(로컬 스크립트 → 운영 DB SELECT + 변경분만 UPDATE).
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const { mapNaverCat } = require('../api/_scrape');

// ── 인자 ──
const arg = (k) => { const a = process.argv.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };
const APPLY = process.argv.includes('apply');
const VERBOSE = process.argv.includes('verbose');  // 변경없음 포함 모든 매칭 항목의 네이버 카테고리 출력(점검용)
const CAT = arg('cat');              // 대상 카테고리(기본 '기타'), namelike 지정 시 무시 가능
const NAMELIKE = arg('namelike');    // 이름 LIKE 대상(예: 안마의자)
const IDS = (arg('ids') || '').split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);  // 특정 매장 id만(콤마구분) — DRY에서 검증한 '안전한' 후보만 선별 적용
const LIMIT = parseInt(arg('limit') || '0', 10) || 0;
const THROTTLE_MS = parseInt(arg('throttle') || '250', 10);
const BATCH = 500;

const NID = process.env.NAVER_SEARCH_CLIENT_ID, NSEC = process.env.NAVER_SEARCH_CLIENT_SECRET;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const norm = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s/g, '').toLowerCase();
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
// 주소에서 시군구(없으면 시/도) 토큰 추출 — 지역 검증용
function regionToken(addr) {
  const a = String(addr || '');
  const sgg = a.match(/([가-힣]{2,}시|[가-힣]{2,}군|[가-힣]{2,}구)/);
  return sgg ? sgg[1] : (a.split(/\s+/)[0] || '');
}
// 매장명에서 지점 접미 제거(핵심 상호만) — 이름 매칭 느슨화용(과도하지 않게)
const coreName = (n) => String(n || '').replace(/\s*(\S+점)$/,'').trim();

async function naverLocal(q) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`;
  const headers = { 'X-Naver-Client-Id': NID, 'X-Naver-Client-Secret': NSEC };
  for (let i = 0; i <= 2; i++) {
    let res;
    try { res = await fetch(url, { headers }); } catch (e) { if (i < 2) { await sleep(800 * (i + 1)); continue; } return { items: [], err: 'fetch' }; }
    if (res.status === 429 || res.status >= 500) { if (i < 2) { await sleep(1200 * (i + 1)); continue; } return { items: [], err: 'throttle' }; }
    if (!res.ok) return { items: [], err: 'http' + res.status };
    try { return { items: (await res.json()).items || [] }; } catch (e) { return { items: [], err: 'parse' }; }
  }
  return { items: [], err: 'retry' };
}

// 매장 → 네이버 재조회 → (이름+지역 일치) 결과의 category 반환. 없으면 null.
async function resolveNaverCat(name, addr) {
  const region = regionToken(addr);
  const nName = norm(coreName(name));
  for (const q of [`${name} ${region}`, `${name}`]) {
    const { items } = await naverLocal(q);
    for (const it of items) {
      const title = norm(it.title);
      const a = (it.roadAddress || it.address || '').replace(/<[^>]+>/g, '');
      const lat = Number(it.mapy) / 1e7, lng = Number(it.mapx) / 1e7;
      if (!(lat >= 33 && lat <= 39.6 && lng >= 124.5 && lng <= 132)) continue;   // 한국 좌표만
      if (region && !a.includes(region)) continue;                                // 지역(시군구) 일치
      if (!(title.includes(nName) || nName.includes(title))) continue;            // 이름 정규화 일치
      return { category: it.category || '', title: it.title.replace(/<[^>]+>/g, ''), addr: a };
    }
    await sleep(90);
  }
  return null;
}

(async () => {
  if (!NID || !NSEC) { console.log('NAVER_SEARCH_CLIENT_ID/SECRET 없음 — .env.local 확인'); process.exit(1); }
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });

  // 대상 선정
  let where, params = [];
  if (IDS.length) { where = `id IN (${IDS.map(() => '?').join(',')})`; params = IDS; }
  else if (NAMELIKE) { where = "name LIKE ? AND COALESCE(hidden,0)=0"; params = ['%' + NAMELIKE + '%']; }
  else { where = "COALESCE(category,'기타') = ? AND COALESCE(hidden,0)=0"; params = [CAT || '기타']; }
  let sql = `SELECT id, name, address, category FROM places WHERE ${where} ORDER BY id`;
  if (LIMIT) sql += ` LIMIT ${LIMIT}`;
  const rows = (await db.execute({ sql, args: params })).rows;
  const label = IDS.length ? `ids=${IDS.length}개` : (NAMELIKE ? 'name~' + NAMELIKE : 'category=' + (CAT || '기타'));
  console.log(`대상 ${rows.length}건  (${label})  모드: ${APPLY ? 'APPLY(실제 쓰기)' : 'DRY(미리보기)'}`);
  console.log('');

  const changes = [];            // {id, name, cur, next, ncat}
  let matched = 0, nomatch = 0, same = 0, errCnt = 0;
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const cur = p.category || '기타';
    let r = null;
    try { r = await resolveNaverCat(p.name, p.address); } catch (e) { errCnt++; }
    if (!r) { nomatch++; }
    else {
      matched++;
      const next = mapNaverCat(r.category, p.name) || '기타';
      if (next && next !== cur) {
        changes.push({ id: Number(p.id), name: p.name, cur, next, ncat: r.category });
        console.log(`  #${p.id} ${p.name}  [${cur}] → [${next}]   (네이버: ${r.category || '?'})`);
      } else { same++; if (VERBOSE) console.log(`  =#${p.id} ${p.name}  [${cur}]   (네이버: ${r.category || '?'})`); }
    }
    if ((i + 1) % 200 === 0) console.log(`  …진행 ${i + 1}/${rows.length}  (변경후보 ${changes.length})`);
    await sleep(THROTTLE_MS);
  }

  console.log('');
  console.log(`── 요약 ──  대상 ${rows.length} · 네이버매칭 ${matched} · 미매칭(스킵) ${nomatch} · 변경없음 ${same} · 에러 ${errCnt}`);
  console.log(`변경 후보: ${changes.length}건`);
  const byDir = {};
  for (const c of changes) { const k = `${c.cur}→${c.next}`; byDir[k] = (byDir[k] || 0) + 1; }
  Object.entries(byDir).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${k}: ${n}`));

  if (!APPLY) { console.log('\n(DRY) 실제 반영하려면 같은 명령 끝에 apply 추가.'); return; }
  if (!changes.length) { console.log('\n변경할 것 없음.'); return; }
  let done = 0;
  for (const grp of chunk(changes, BATCH)) {
    await db.batch(grp.map(c => ({ sql: 'UPDATE places SET category=? WHERE id=?', args: [c.next, c.id] })), 'write');
    done += grp.length; console.log(`  적용 ${done}/${changes.length}`);
  }
  console.log(`\n✅ ${done}건 카테고리 교정 완료.`);
})();
