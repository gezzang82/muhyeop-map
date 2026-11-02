// 주간 데이터 리포트 자동 생성 — 전국 체험단 협찬 현황을 집계해 블로그/스레드/인스타 초안 3종 출력.
// 실행: node scripts/weekly-data-report.js  (운영 DB 읽기전용, TURSO_PROD_* 사용)
// 결과: output/weekly-report-YYYY-MM-DD.md 저장 + 콘솔 출력. 수치는 매주 자동 반영.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const g = (k) => { const m = env.match(new RegExp('^' + k + '\\s*=\\s*"?([^"\\n]+)"?', 'm')); return m ? m[1].trim() : ''; };
const { createClient } = require(path.join(REPO, 'node_modules/@libsql/client'));
const db = createClient({ url: g('TURSO_PROD_URL') || g('TURSO_DATABASE_URL'), authToken: g('TURSO_PROD_AUTH_TOKEN') || g('TURSO_AUTH_TOKEN') });

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const rows = async (s) => (await db.execute(s)).rows;
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const pct = (part, whole) => whole ? Math.round((part / whole) * 100) : 0;
const manRound = (n) => Math.round(n / 10000);             // 3만
const manCheon = (n) => {                                   // 2만 4천
  const man = Math.floor(n / 10000), cheon = Math.round((n % 10000) / 1000);
  return (man ? man + '만' : '') + (cheon ? ' ' + cheon + '천' : '');
};

// 활성(모집중) 조건: 비숨김 + (마감일>=오늘 OR 상시(빈값)이고 등록 45일 이내)
const ACT = `c.hidden=0 AND ((c.deadline>='${today}') OR ((c.deadline='' OR c.deadline IS NULL) AND date(c.created_at,'+9 hours')>=date('${today}','-45 day')))`;
const JOINACT = `FROM campaigns c JOIN places p ON p.id=c.place_id WHERE p.hidden=0 AND ${ACT}`;
const REGION_CASE = `CASE
  WHEN p.address LIKE '서울%' THEN '서울' WHEN p.address LIKE '경기%' THEN '경기'
  WHEN p.address LIKE '인천%' THEN '인천' WHEN p.address LIKE '부산%' THEN '부산'
  WHEN p.address LIKE '대구%' THEN '대구' WHEN p.address LIKE '대전%' THEN '대전'
  WHEN p.address LIKE '광주%' THEN '광주' WHEN p.address LIKE '울산%' THEN '울산'
  WHEN p.address LIKE '세종%' THEN '세종' WHEN p.address LIKE '강원%' THEN '강원'
  WHEN p.address LIKE '충북%' OR p.address LIKE '충청북%' THEN '충북'
  WHEN p.address LIKE '충남%' OR p.address LIKE '충청남%' THEN '충남'
  WHEN p.address LIKE '전북%' OR p.address LIKE '전라북%' THEN '전북'
  WHEN p.address LIKE '전남%' OR p.address LIKE '전라남%' THEN '전남'
  WHEN p.address LIKE '경북%' OR p.address LIKE '경상북%' THEN '경북'
  WHEN p.address LIKE '경남%' OR p.address LIKE '경상남%' THEN '경남'
  WHEN p.address LIKE '제주%' THEN '제주' ELSE '기타' END`;

async function aggregate() {
  const tot = (await rows(`SELECT COUNT(*) n, COUNT(DISTINCT c.place_id) pl ${JOINACT}`))[0];
  const plat = (await rows(`SELECT COUNT(DISTINCT c.platform) n ${JOINACT}`))[0];
  const byReg = await rows(`SELECT ${REGION_CASE} AS reg, COUNT(*) n ${JOINACT} GROUP BY reg ORDER BY n DESC`);
  const byCat = await rows(`SELECT COALESCE(NULLIF(p.category,''),'기타') cat, COUNT(*) n ${JOINACT} GROUP BY cat ORDER BY n DESC`);
  const byPlat = await rows(`SELECT COALESCE(NULLIF(c.platform,''),'기타') pf, COUNT(*) n ${JOINACT} GROUP BY pf ORDER BY n DESC`);
  return {
    total: Number(tot.n || 0), places: Number(tot.pl || 0), platforms: Number(plat.n || 0),
    byReg: byReg.map(r => ({ k: r.reg, n: Number(r.n) })),
    byCat: byCat.map(r => ({ k: r.cat, n: Number(r.n) })),
    byPlat: byPlat.map(r => ({ k: r.pf, n: Number(r.n) })),
  };
}

function derive(d) {
  const m = (arr, k) => (arr.find(x => x.k === k) || { n: 0 }).n;
  const seoul = m(d.byReg, '서울'), gg = m(d.byReg, '경기'), ic = m(d.byReg, '인천');
  const capital = seoul + gg + ic;
  const topCat = d.byCat[0] || { k: '-', n: 0 };
  const top3plat = d.byPlat.slice(0, 3);
  const top3sum = top3plat.reduce((s, x) => s + x.n, 0);
  return {
    capitalPct: pct(capital, d.total), seoulGgPct: pct(seoul + gg, d.total),
    topCat, topCatPct: pct(topCat.n, d.total),
    top3plat, top3Pct: pct(top3sum, d.total),
  };
}

function genBlog(d, x) {
  const regLine = d.byReg.filter(r => r.k !== '기타').slice(0, 8).map(r => `${r.k} ${fmt(r.n)}`).join(' · ');
  const catLine = d.byCat.slice(0, 7).map(r => `${r.k} ${fmt(r.n)}`).join(' · ');
  const platLine = d.byPlat.slice(0, 6).map(r => `${r.k} ${fmt(r.n)}`).join(' · ');
  return `[제목(SEO)] 전국 체험단 협찬 ${manRound(d.total)}만 건 현황 분석 (${today.replace(/-/g, '.')}) — 지역·카테고리·플랫폼 데이터

📊 전국 체험단 협찬 ${manRound(d.total)}만 건, 지금 어디에 몰려 있을까? (${today} 데이터)

무협맵은 리뷰노트·디너의여왕·강남맛집·레뷰·미블 등 ${d.platforms}개 체험단 플랫폼의
협찬 정보를 지도 한 곳에 모읍니다. 그 데이터로 "지금 전국 체험단 현황"을 정리했습니다.
(${today} 기준, 모집 중인 협찬만)

■ 한눈에 보는 숫자
- 모집 중인 협찬: 약 ${fmt(d.total)}건
- 진행 매장: 약 ${fmt(d.places)}곳
- 집계 플랫폼: ${d.platforms}개

■ 지역별 — 수도권 집중 ${x.capitalPct}%
${regLine} …
→ 경기·서울만으로 전체의 ${x.seoulGgPct}%, 인천까지 수도권이 ${x.capitalPct}%.
   다만 지방 광역권에도 협찬이 꾸준히 살아있어 지역 블로거도 노려볼 만합니다.

■ 카테고리별 — ${x.topCat.k} ${x.topCatPct}%
${catLine} …
→ 체험단의 본진은 ${x.topCat.k}. 하지만 뷰티·카페·운동처럼 경쟁이 덜한 쪽에 오히려 기회가 있습니다.

■ 플랫폼별 — 상위 3곳이 ${x.top3Pct}%
${platLine} …
→ ${x.top3plat.map(p => p.k).join('·')} 3곳이 ${x.top3Pct}%. 하지만 나머지 플랫폼에도 남들이 덜 보는 협찬이 숨어 있어, 여러 곳을 '지도 하나로' 보는 게 이득입니다.

■ 그래서?
협찬은 많지만 플랫폼마다 흩어져 '내 주변에 뭐가 떴는지' 한눈에 보기 어렵습니다.
무협맵은 이 ${manRound(d.total)}만 건을 지도 위에 모아, 내 동네 협찬을 바로 찾게 해줍니다.
👉 muhyeop.com (회원가입 없이 무료)

#체험단 #협찬 #블로그체험단 #체험단정보 #리뷰어 #체험단꿀팁`;
}

function genThreads(d, x) {
  return `전국에 지금 모집 중인 체험단 협찬 세봤더니… ${manRound(d.total)}만 건이 넘더라ㅋㅋ

재밌는 게,
- 경기+서울이 거의 절반(${x.seoulGgPct}%)
- ${x.topCat.k}이 ${x.topCatPct}%로 압도
- ${x.top3plat.map(p => p.k).join('·')} 3곳이 ${x.top3Pct}% 차지

근데 이게 플랫폼마다 흩어져 있어서
'내 동네에 뭐 떴나'를 한눈에 보기가 힘들어.
그래서 지도에 다 모으는 중이야 📍

다들 주로 어느 플랫폼에서 찾아?`;
}

function genInsta(d, x) {
  return `1 (표지)  지금 전국에 모집 중인 체험단, 몇 건일까? 📊
2 (충격)   ${manRound(d.total)}만 건 돌파. 매장 ${manCheon(d.places)} 곳에서 모집 중 👀
3 (지역)   경기·서울이 ${x.seoulGgPct}% · 수도권 ${x.capitalPct}% / 지방도 꾸준
4 (종류)   ${x.topCat.k} ${x.topCatPct}% 압도 · 뷰티·카페·운동 뒤이음
5 (플랫폼)  ${x.top3plat.map(p => p.k).join('·')} 3곳이 ${x.top3Pct}%
6 (CTA)    흩어진 ${manRound(d.total)}만 건, 지도 한 곳에서 👉 '무협맵' 검색`;
}

async function main() {
  const d = await aggregate();
  const x = derive(d);
  const out = `# 무협맵 주간 데이터 리포트 — ${today}

> 자동 생성(scripts/weekly-data-report.js). 운영 전 수치/문구 검수 후 발행.

## A. 네이버 블로그 (Searchable)
${genBlog(d, x)}

---

## B. 스레드 (Shareable·반말)
${genThreads(d, x)}

---

## C. 인스타 카루셀 (6장)
${genInsta(d, x)}

---

## 원자료(검수용)
- 활성 협찬 ${fmt(d.total)}건 / 매장 ${fmt(d.places)}곳 / 플랫폼 ${d.platforms}개
- 지역: ${d.byReg.map(r => r.k + ' ' + fmt(r.n)).join(' · ')}
- 카테고리: ${d.byCat.map(r => r.k + ' ' + fmt(r.n)).join(' · ')}
- 플랫폼: ${d.byPlat.map(r => r.k + ' ' + fmt(r.n)).join(' · ')}
`;
  const dir = path.join(REPO, 'output');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const file = path.join(dir, `weekly-report-${today}.md`);
  fs.writeFileSync(file, out);
  console.log(out);
  console.log('\n✅ 저장:', file);
  return { d, x, file };
}

module.exports = { aggregate, derive, genBlog, genThreads, genInsta, today, fmt, manRound, manCheon, db };
if (require.main === module) main().catch(e => { console.error('ERR', e.message); process.exit(1); });
