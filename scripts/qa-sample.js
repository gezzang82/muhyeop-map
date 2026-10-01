// 자동등록(source=ai) 품질 자체검수 — 최근 N일분에서 '의심 항목'만 골라 리포트.
// ⚠️ 읽기 전용(SELECT만, 쓰기 없음). 운영 DB(TURSO_PROD_*) 대상.
// 실행: node scripts/qa-sample.js [days]   (기본 1일)
//
// 검사 항목(파서 _scrape.js / 오토파일럿 _autopilot.js 규칙 재활용):
//  1) 이름 오염: [대괄호] 접두/접미, 층/평/건물동(E동·101동) 접두 잔존
//  2) 빈 내용(content 없음)
//  3) 주소 없음 / 좌표 한국범위 밖·누락
//  4) 중복 매장 의심: 같은 이름(공백무시) + 50m 내 다른 매장 존재
//  5) 카테고리 과대분류 의심: category=음식점인데 음식 키워드 전무 (오탐 가능 → 참고용)
//  6) 이미 지난 마감일(공개앱은 활성필터로 숨겨지나 파싱오류 신호)
const fs = require('fs');
const ROOT = __dirname + '/..';
const envfile = '.env' + '.local';
fs.readFileSync(ROOT + '/' + envfile, 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});
const { createClient } = require(ROOT + '/node_modules/@libsql/client');

const norm = s => (s || '').replace(/\s/g, '').toLowerCase();
const FOOD = /(맛집|음식|식당|한식|중식|일식|양식|고기|삼겹|고깃|치킨|피자|버거|햄버거|파스타|스시|초밥|회|횟집|해물|해산물|찜|탕|국밥|찌개|분식|떡볶이|김밥|국수|면류|라멘|라면|우동|카츠|돈까스|돈가스|쌀국수|베트남|타이|멕시칸|브런치|레스토랑|다이닝|비스트로|포차|주점|이자카야|호프|술집|바베큐|바비큐|곱창|막창|족발|보쌈|칼국수|만두|샤브|뷔페|부페|정식|백반|덮밥|규동|텐동|샐러드|베이커리|도넛|샌드위치|포케|버섯|장어|아구|낙지|주꾸미|닭|오리|양꼬치|마라|훠궈|딤섬|파이|타코|케밥|커리|카레|짬뽕|짜장|중화|스테이크|와인바|맥주|와인)/;
const CAFE = /(카페|커피|디저트|베이글|케이크|빙수|브런치|와플|마카롱|티룸|찻집|에스프레소|로스터|스무디|주스|음료)/;

// 이름 오염 접두(cleanStoreName가 제거하는 패턴들이 잔존했는지)
const FLOOR_DONG = /^\s*(?:[A-Za-z0-9]+동(?![가-힣])|지상\s*\d+평?대?|지하\s*\d*층?|지층|B\d+호?|\d+층|\d+평대?|\d+호)\s+/;

(async () => {
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });
  const days = parseInt(process.argv[2] || '1', 10);
  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 오늘

  const rows = (await db.execute(
    `SELECT c.id AS cid, c.content, c.deadline, c.platform,
            p.id AS pid, p.name, p.category, p.address, p.lat, p.lng
     FROM campaigns c JOIN places p ON p.id = c.place_id
     WHERE c.source='ai' AND c.created_at >= datetime('now','-${days} days') AND COALESCE(c.hidden,0)=0
     ORDER BY c.id DESC`
  )).rows;

  // 중복 매장 판정용: 전체 매장 이름/좌표 1회 로드(공백무시 이름 → 좌표목록)
  const allPlaces = (await db.execute(`SELECT id, name, lat, lng FROM places WHERE COALESCE(hidden,0)=0`)).rows;
  const byName = new Map();
  for (const p of allPlaces) {
    const k = norm(p.name); if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(p);
  }
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0007 && Math.abs(a.lng - b.lng) < 0.0007;

  const I = { bracket: [], floorDong: [], emptyContent: [], noAddr: [], badCoord: [], dup: [], foodNoKw: [], pastDeadline: [] };
  const seenDupPid = new Set();
  for (const r of rows) {
    const name = r.name || '';
    if (/^\s*[\[［]/.test(name) || /[\]］]\s*$/.test(name)) I.bracket.push(r);
    if (FLOOR_DONG.test(name)) I.floorDong.push(r);
    if (!norm(r.content)) I.emptyContent.push(r);
    if (!norm(r.address)) I.noAddr.push(r);
    if (r.lat == null || r.lng == null || r.lat < 33 || r.lat > 39 || r.lng < 124 || r.lng > 132) I.badCoord.push(r);
    if (r.category === '음식점' && !FOOD.test(name) && !CAFE.test(name)) I.foodNoKw.push(r);
    if (r.deadline && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) && r.deadline < todayStr) I.pastDeadline.push(r);
    // 중복(같은 이름 + 50m 내 다른 매장), 매장 1건당 1회만
    if (!seenDupPid.has(r.pid) && r.lat != null && r.lng != null) {
      const same = (byName.get(norm(name)) || []).filter(o => o.id !== r.pid && near(o, r));
      if (same.length) { I.dup.push({ ...r, dupWith: same.map(s => s.id) }); seenDupPid.add(r.pid); }
    }
  }

  const totalPlaces = new Set(rows.map(r => r.pid)).size;
  console.log(`\n===== 자동등록 품질검수 (최근 ${days}일, ${todayStr} KST 기준) =====`);
  console.log(`대상: 캠페인 ${rows.length}건 / 매장 ${totalPlaces}곳 (source=ai, 숨김제외)\n`);
  const show = (label, arr, fmt, cap = 10) => {
    console.log(`■ ${label}: ${arr.length}건`);
    arr.slice(0, cap).forEach(r => console.log('   - ' + fmt(r)));
    if (arr.length > cap) console.log(`   … 외 ${arr.length - cap}건`);
    console.log('');
  };
  const base = r => `[${r.pid}] ${r.name} | ${r.category || '(무)'} | ${(r.address || '(주소없음)').slice(0, 40)}`;
  show('🔴 이름 오염(대괄호)', I.bracket, base);
  show('🔴 이름 오염(층/평/건물동 접두)', I.floorDong, base);
  show('🟠 중복 매장 의심(같은이름+50m)', I.dup, r => base(r) + ` ↔ 매장 ${r.dupWith.join(',')}`);
  show('🟠 빈 내용(content)', I.emptyContent, r => `[cid ${r.cid}] ${r.name} | ${r.platform}`);
  show('🟠 좌표 이상/누락', I.badCoord, r => base(r) + ` (lat=${r.lat},lng=${r.lng})`);
  show('🟡 주소 없음', I.noAddr, r => `[${r.pid}] ${r.name} | ${r.platform}`);
  show('🟡 음식점 과대분류 의심(오탐가능)', I.foodNoKw, base, 15);
  show('⚪ 지난 마감일(공개앱은 숨김)', I.pastDeadline, r => `[cid ${r.cid}] ${r.name} | 마감 ${r.deadline}`, 5);

  const totalIssues = I.bracket.length + I.floorDong.length + I.dup.length + I.emptyContent.length + I.badCoord.length + I.noAddr.length;
  console.log(`===== 요약: 확실이슈(빨강+주황+주소) ${totalIssues}건, 확인필요(음식점) ${I.foodNoKw.length}건 =====`);
})().catch(e => console.error('ERR', e.message));
