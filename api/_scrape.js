/**
 * 디너의여왕 서버 사이드 수집기 (어드민 데이터수집 Phase 1)
 *
 * - scripts/scrape-dinnerqueen.js + normalize-dinnerqueen.js의 결정적 파서를 서버로 이식(파일 I/O 없음, AI토큰 0).
 * - 증분 수집: scrape_state.last_max_id 커서 이후(id가 더 큰) 캠페인만 처리.
 * - 운영 매장/캠페인과 대조해 활성 채널중복(dup_active)은 스테이징에서 제외.
 * - 결과를 scraped_items(status='pending')에 INSERT OR IGNORE, scrape_state/scrape_runs 갱신.
 *
 * ⚠️ robots 허용 범위 내 저빈도. 새 api 파일 아님(_ 접두사 = 함수 카운트 제외).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BASE = 'https://dinnerqueen.net';
const listUrl = (area2, region = '서울') => `${BASE}/taste?ct=${encodeURIComponent('지역')}&area1=${encodeURIComponent(region)}&area2=${encodeURIComponent(area2)}`;
const SEOUL_AREA2 = ['강남/논현/압구정', '강동/천호', '강서/목동/마곡', '건대/왕십리', '관악/신림', '교대/사당', '노원/강북', '명동/이태원', '삼성/선릉', '서초/반포', '송파/잠실', '수유/동대문/중랑', '시청/남대문', '여의도/영등포/구로', '종로/대학로', '홍대/마포/신촌', '기타'];
// 경기 하위지역(디너의여왕 area2). '인천/부천/부평'은 인천 지역과 겹쳐 제외.
const GYEONGGI_AREA2 = ['수원/화성/오산/평택', '의정부/동두천', '성남/판교', '광명/시흥', '과천/안양/안산', '남양주/구리/하남', '일산/파주/고양/김포/포천', '기타'];
// 지역별 하위지역 맵(하위지역 선택 수집 지원 지역만). 부산/인천은 하위지역 미지원(전체만).
const AREA2_BY_REGION = { '서울': SEOUL_AREA2, '경기': GYEONGGI_AREA2 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ===== 파싱 (scrape-dinnerqueen.js와 동일 로직) =====
function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
function metaContent(html, prop) {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? m[1] : '';
}
function parseTitle(ogTitle) {
  let t = ogTitle.replace(/^디너의여왕\s*-\s*/, '').trim();
  const brackets = [...t.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
  const region = brackets[0] || '';
  let name = t.replace(/\[[^\]]*\]/g, '').trim().replace(/\s*\d+\s*차\s*$/, '').trim();
  return { region, name };
}
function titleSection(html) {
  const i = html.indexOf('id="TasteDetailTitle"');
  if (i < 0) return '';
  const j = html.indexOf('제공 내역', i);
  return html.slice(i, j > 0 ? j : i + 8000);
}
function parseChannel(html) {
  const blob = (titleSection(html).match(/qz-ico[^"]*/g) || []).join(' ');
  const ch = [];
  if (/reels/.test(blob)) ch.push('릴스');
  if (/clip|klip/.test(blob)) ch.push('클립');
  if (/nv-blog|_blog\b/.test(blob)) ch.push('블로그');
  if (/sns-ins|_insta/.test(blob) && !ch.includes('릴스')) ch.push('인스타그램');
  if (/youtube|ytb/.test(blob)) ch.push('유튜브');
  let out = ch;
  if (out.includes('클립') && out.includes('블로그')) out = out.filter((c) => c !== '블로그');
  return out.join(',');
}
const CT_NON_CATEGORY = new Set(['릴스', '클립', '블로그', '인스타그램', '인스타', '유튜브', '기자단', '페이백', '맞춤', '지역']);
function parsePlatformCategory(html) {
  const cts = [...new Set([...html.matchAll(/ct=([가-힣]+)/g)].map((m) => m[1]))];
  return cts.find((c) => !CT_NON_CATEGORY.has(c)) || '';
}
function parseAddress(html, storeName) {
  const txt = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  let m = txt.match(/방문\s*위치\s*[:：]\s*([가-힣][가-힣A-Za-z0-9\s\-]+?\d[\d\-]*(?:\s*[가-힣]+\s*\d[\d\-]*)*)/);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  m = html.match(/주석처리\.\s*([가-힣0-9][가-힣A-Za-z0-9\s\-]+?)\s*-->/);
  if (!m) return '';
  let addr = m[1].replace(/\s+/g, ' ').trim();
  if (storeName && addr.endsWith(storeName)) addr = addr.slice(0, -storeName.length).trim();
  return addr;
}
function parseVisit(html) {
  const txt = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  const hm = txt.match(/체험\s*시간\s*[:：]?\s*(.+?)(?=\s*휴무일|\s*방문\s*위치|\s*해당\s*캠페인|$)/);
  const cm = txt.match(/휴무일\s*[:：]?\s*(.+?)(?=\s*방문\s*위치|\s*해당\s*캠페인|\s*예약\s*문의|$)/);
  let hours = hm ? hm[1].replace(/\s+/g, ' ').trim().slice(0, 150) : '';
  let closedRaw = cm ? cm[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const bi = txt.indexOf('방문 및 예약');
  if (bi >= 0) {
    const be = txt.indexOf('방문 위치', bi);
    const block = txt.slice(bi, be > 0 ? be : bi + 800);
    const bans = (block.match(/(?<![가-힣])[월화수목금토일][월화수목금토일요,\s및]*\s*(?:[가-힣]{1,4}\s*)?(?:체험|방문|이용)\s*(?:불가|휴무)/g) || []).join(' ');
    if (bans) closedRaw += ' ' + bans;
    if (!/\d/.test(hours)) {
      const bm = block.match(/(?:방문\s*가능\s*시간|영업\s*시간|이용\s*시간|체험\s*가능\s*시간)\s*[-:：]?\s*([^★]*?\d[^★]*)/);
      if (bm) hours = bm[1].replace(/\s+/g, ' ').trim().slice(0, 150);
      else {
        // 라벨 없이 문장에 시간이 박힌 경우: "13:00 이후부터 체험가능", "17시 이후 방문가능", "11:00~22:00"
        const tm = block.match(/(\d{1,2}\s*:\s*\d{2}(?:\s*[~\-–]\s*\d{1,2}\s*:\s*\d{2})?|\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?)\s*(이후|부터)?/);
        if (tm) hours = (tm[1] + (tm[2] ? ' 이후' : '')).replace(/\s+/g, ' ').trim();
      }
    }
  }
  return { hours, closedRaw };
}
const ALL_DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function daysFromText(t) {
  const set = new Set();
  if (/주말/.test(t)) { set.add('토'); set.add('일'); }
  if (/평일/.test(t)) ['월', '화', '수', '목', '금'].forEach((d) => set.add(d));
  for (const m of t.matchAll(/([월화수목금토일])\s*[~\-–]\s*([월화수목금토일])/g)) {
    let a = WEEK.indexOf(m[1]);
    for (let k = 0; k < 7; k++) { const idx = (a + k) % 7; set.add(WEEK[idx]); if (WEEK[idx] === m[2]) break; }
  }
  for (const d of ALL_DAYS) if (new RegExp(`(^|[^가-힣])${d}(요일)?([^가-힣~\\-–]|$)`).test(t)) set.add(d);
  return set;
}
const CLOSED_AFTER = /(?:체험\s*불가|불가|휴무일?|휴무)\s*[:：\-]?\s*([월화수목금토일요,\s~\-–]*)/g;
const CLOSED_BEFORE = /(?<![가-힣])(주말|평일|[월화수목금토일][월화수목금토일요,\s~\-–/]*)\s*(?:(?:체험|방문|이용)\s*)?(?:불가|휴무)/g;
const WEEKEND_CLOSE = /(주말|평일)(?:[\s,/·및]|체험|이용|방문|공휴일?|[월화수목금토일](?:요일)?)*(?:불가|휴무|제외)/g;
function collectClosed(text) {
  const set = new Set();
  for (const m of text.matchAll(CLOSED_AFTER)) daysFromText(m[1]).forEach((d) => set.add(d));
  for (const m of text.matchAll(CLOSED_BEFORE)) daysFromText(m[1]).forEach((d) => set.add(d));
  return set;
}
// "~할/될/볼 수 있(없)"의 '수'가 수요일로 오인되는 것 방지(한글 뒤 ' 수 있/없' 제거).
const stripSuAux = (s) => (s || '').replace(/([가-힣])\s*수\s*(있|없)/g, '$1 $2');
function deriveDays(hoursIn, closedIn) {
  const hours = stripSuAux((hoursIn || '').replace(/공휴일?/g, ' ')).replace(/\s+/g, ' ');
  const closedRaw = stripSuAux((closedIn || '').replace(/공휴일?/g, ' ')).replace(/\s+/g, ' ');
  let openSet;
  // 전 요일 가능 신호: 매일/모든 요일/연중무휴 + '모두 가능'·'영업시간 내'·'상시'(요일 제한 없음)
  if (/매일|모든\s*요일|연중무휴|무휴|모두\s*가능|영업\s*시간\s*내|상시/.test(hours)) {
    openSet = new Set(ALL_DAYS);
  } else {
    const openText = hours.replace(CLOSED_BEFORE, ' ').replace(WEEKEND_CLOSE, ' ').replace(CLOSED_AFTER, ' ');
    const s = daysFromText(openText);
    openSet = s.size ? s : new Set(ALL_DAYS);
  }
  const closed = collectClosed(hours);
  daysFromText(closedRaw).forEach((d) => closed.add(d));
  for (const m of `${hours} ${closedRaw}`.matchAll(WEEKEND_CLOSE)) daysFromText(m[1]).forEach((d) => closed.add(d));
  const avail = ALL_DAYS.filter((d) => openSet.has(d) && !closed.has(d));
  return avail.length === 0 ? '' : avail.join(',');
}
const TIME_RE = /\d{1,2}\s*[:시]\s*\d{0,2}\s*[~\-–]\s*[^\d~]{0,6}\d{1,2}/g;
function stripDayClosed(text) {
  return text
    .replace(CLOSED_BEFORE, (m, g) => (daysFromText(g).size ? ' ' : m))
    .replace(CLOSED_AFTER, (m, g) => (daysFromText(g).size ? ' ' : m));
}
function stripExclusionNotes(s) {
  const t = s
    .replace(/[(（★•]*\s*(?:[월화수목금토일](?:요일)?|주말|평일|공휴일?)(?:[\s,/및·]+|체험|이용|방문|공휴일?|[월화수목금토일](?:요일)?)*(?:불가|휴무|제외)\s*[)）]?/g, ' ')
    .replace(/[(（★•]*\s*(?:체험\s*불가|불가|휴무일?|휴무|제외)\s*[:：\-]?\s*(?:[월화수목금토일](?:요일)?|주말|평일|공휴일)(?:[,\s/·및]+|[월화수목금토일](?:요일)?|주말|평일|공휴일)*\s*[)）]?/g, ' ');
  return t.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
}
function cleanHours(hours) {
  if (!hours) return '';
  const tidy = (s) => s.replace(/\s+/g, ' ').replace(/\(\s*\)/g, ' ').replace(/[\s★•\-:：/·,]+$/, '').replace(/\s+/g, ' ').trim();
  const src = stripExclusionNotes(hours);
  const times = src.match(TIME_RE) || [];
  let out;
  if (times.length !== 1) {
    out = tidy(src);
  } else {
    let h = stripDayClosed(src);
    h = h.replace(/^[\s★•\-]*(?:주말|평일|매일|모든\s*요일|[월화수목금토일])[월화수목금토일요주말평일및,\s~\-–]*\s*[:：]?\s*/, '');
    out = tidy(h);
  }
  return /\d/.test(out) ? out : '';
}
function parseExcludeHoliday(hours, closedRaw) {
  const blob = `${hours} ${closedRaw}`;
  if (!/공휴/.test(blob)) return '';
  // 공휴일 ~(최대 12자, '전날 방문' 등 사이문구 허용)~ 불가/휴무/제외  또는 그 역순
  if (/공휴일?.{0,12}(체험\s*불가|불가능|불가|휴무|제외)/.test(blob)) return 'Y';
  if (/(체험\s*불가|불가|휴무|제외)[^가-힣]{0,10}공휴일?/.test(blob)) return 'Y';
  return '';
}
function parseDeadline(html) {
  const m = html.match(/(\d{2})\.(\d{2})\.(\d{2})\s*[–\-~]\s*(\d{2})\.(\d{2})\.(\d{2})/);
  return m ? `20${m[4]}-${m[5]}-${m[6]}` : '';
}
function parseContent(html) {
  const txt = stripTags(html
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, ' '));
  const i = txt.indexOf('제공 내역');
  if (i < 0) return '';
  let seg = txt.slice(i + 5);
  const cut = seg.search(/참여\s*전|필수\s*확인|유의사항|주의사항|매장\s*정보|방문\s*및\s*예약|방문\s*위치|블로그\s*키워드|체험\s*시간|예약\s*필수|https?:\/\//);
  if (cut > 0) seg = seg.slice(0, cut);
  return seg.replace(/^내역\s*/, '').replace(/-->/g, ' ').replace(/(\s*\+\s*){2,}/g, ' + ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

// ===== 정규화 (normalize-dinnerqueen.js와 동일) =====
function cleanContent(c) {
  if (!c) return '';
  return c.replace(/qz-[a-z-]+/gi, ' ').replace(/해당 캠페인은[^.]*합니다\.?/g, ' ').replace(/(\s*\+\s*){2,}/g, ' + ').replace(/\s+/g, ' ').trim();
}
function categoryByKeyword(content, name) {
  const s = content + ' ' + name;
  if (/사주|타로|운세|점집|신점|철학관|작명|무속|명리|손금|관상/.test(s)) return '기타';
  if (/원데이\s*클래스|클래스\s*체험|보컬|레슨|트레이닝|학원|공방|드로잉|플라워|캔들|공예|만들기|전시|관람|원데이클래스|파티룸|대관|모임\s*공간|공간\s*대여|스튜디오|셀프사진|포토부스|방탈출|보드게임/.test(s)) return '문화';
  if (/케이크|디저트|베이커리|커피|브런치|룸카페|스터디카페|카페/.test(s)) return '카페';
  if (/네일|피부|왁싱|헤어|미용|에스테틱|마사지|태닝|속눈썹|반영구|필러|보톡스|두피|체형|다이어트|\b펌\b|염색|풋앤바디|풋마사지|발마사지|타이마사지|스웨디시|아로마|경락|림프|바디케어|스킨케어|피부관리/.test(s)) return '뷰티';
  if (/숙박|호텔|모텔|펜션|글램핑|카라반|풀빌라|리조트|게스트하우스|한옥스테이|캠핑/.test(s)) return '숙박/여가';
  if (/식사|한우|고기|맛집|정육|초밥|스시|오마카세|파스타|삼겹|국밥|치킨|피자|족발|해산물|일식|중식|양식|한식|뷔페|음식|식당|쌀국수|국수|분식|포차|이자카야|와인|샴페인|맥주|칵테일|하이볼|고깃집|횟집|수산|장어|곱창|막창|전골|찜닭|매운탕|감자탕|갈비탕|양꼬치|돈까스|샐러드|버거|정식|식닭|짬뽕|마라탕|보쌈|덮밥|찌개|라멘|우동|카츠/.test(s)) return '음식점';
  return '';
}
function mapCategory(platformCat, content, name) {
  const s = content + ' ' + name;
  if (/헬스|피트니스|퍼스널\s*트레이닝|\bPT\b/i.test(s)) return { cat: '기타', flag: false };
  if (platformCat === '뷰티') return { cat: '뷰티', flag: false };
  if (platformCat === '맛집') {
    if (/카페|디저트|케이크|베이커리|커피|브런치|빙수|마카롱|도넛|와플|타르트|아이스크림|젤라또|스무디|밀크티|버블티|베이글|크로플|휘낭시에|쿠키/.test(s)) return { cat: '카페', flag: false };
    return { cat: '음식점', flag: false };
  }
  if (platformCat === '여가') {
    if (/숙박|호텔|모텔|펜션|글램핑|카라반|풀빌라|캠핑|리조트|게스트하우스|한옥스테이|독채|\b스테이\b/.test(s)) return { cat: '숙박/여가', flag: false };
    if (/헬스|피트니스|필라테스|요가|골프|클라이밍|스크린골프|퍼스널트레이닝|\bPT\b/i.test(s)) return { cat: '기타', flag: false };
    if (/사주|타로|운세|점집|신점|철학관|작명/.test(s)) return { cat: '기타', flag: false };
    return { cat: '문화', flag: true };
  }
  if (platformCat === '배송') return { cat: '기타', flag: true };
  const auto = categoryByKeyword(content, name);
  return { cat: auto || '음식점', flag: !auto };
}
const CATEGORY_OVERRIDE = [
  [/프리즘\s*홍대점/, '기타'],
  [/에뚜왈\s*가로수길점/, '카페'],
  [/부타캣\s*강서점/, '문화'],
];

// ===== 수집 파이프라인 =====
// 더보기(AJAX) 페이지: /taste/taste_list?...&page=N → {layout, has_next}. X-Requested-With 필수.
async function fetchTasteListPage(area1, area2, page) {
  const url = `${BASE}/taste/taste_list?ct=${encodeURIComponent('지역')}&area1=${encodeURIComponent(area1)}&area2=${encodeURIComponent(area2)}&page=${page}&ctype=&query=`;
  const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Referer: listUrl(area2, area1) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const ids = [...String(j.layout || '').matchAll(/\/taste\/(\d+)/g)].map((m) => parseInt(m[1], 10));
  return { ids, hasNext: !!j.has_next };
}
// 한 지역(area2)의 목록을 페이지네이션으로 수집. sinceId(커서)보다 최신인 페이지까지만 훑고 멈춤(증분=빠름, 리셋 후=깊게).
async function collectAreaIds(area1, area2, sinceId = 0, maxPages = 10) {
  const idSet = new Set();
  for (let page = 1; page <= maxPages; page++) {
    let r;
    try { r = await fetchTasteListPage(area1, area2, page); } catch (e) { break; }
    if (!r.ids.length) break;
    r.ids.forEach((id) => idSet.add(id));
    if (sinceId && Math.max(...r.ids) <= sinceId) break; // 이 페이지가 전부 커서 이하면 이후는 볼 필요 없음
    if (!r.hasNext) break;
    await sleep(600);
  }
  return [...idSet];
}
async function collectIds(mode, region = '서울', sinceId = 0) {
  // 디너의여왕은 독립 '인천' 지역(area1)이 없고, 인천을 경기>인천/부천/부평 하위지역에 둔다.
  if (region === '인천') return collectAreaIds('경기', '인천/부천/부평', sinceId);
  if (mode === 'all-seoul' && region === '서울') {
    // 서울 전역: 하위지역별로 수집(각 지역은 페이지 얕게 3장까지 — 전역은 폭이 넓어 과도한 요청 방지)
    const idSet = new Set();
    for (const a2 of SEOUL_AREA2) {
      for (const id of await collectAreaIds(region, a2, sinceId, 3)) idSet.add(id);
      await sleep(300);
    }
    return [...idSet];
  }
  if (AREA2_BY_REGION[region] && AREA2_BY_REGION[region].includes(mode)) {
    return collectAreaIds(region, mode, sinceId); // 특정 하위지역(서울·경기), 페이지네이션
  }
  return collectAreaIds(region, '전체', sinceId); // 지역 전체, 페이지네이션
}

function scrapeDetail(html, id) {
  const og = metaContent(html, 'og:title');
  const { region, name } = parseTitle(og);
  const channel = parseChannel(html);
  const address = parseAddress(html, name);
  const deadline = parseDeadline(html);
  const rawContent = parseContent(html);
  const platformCategory = parsePlatformCategory(html);
  const { hours: rawHours, closedRaw } = parseVisit(html);
  let days = deriveDays(rawHours, closedRaw);
  const hours = cleanHours(rawHours);
  const excludeHoliday = parseExcludeHoliday(rawHours, closedRaw);
  const content = cleanContent(rawContent);
  // 예약필수·자유텍스트로 요일/공휴일이 안내문에만 있는 케이스 감지(예: "연중무휴"인데 실제 월~목·공휴일 불가).
  // 제한 문구가 있는데 결과가 전 요일이면 → 틀린 전요일 대신 비우고 검수 플래그. 공휴일 언급인데 미반영도 플래그.
  const noticeBlob = `${rawHours} ${closedRaw}`;
  const hasDayRestriction = /(?:방문|체험|이용)\s*불가|방문\s*불가|휴무|제외/.test(noticeBlob);
  // 격주/매월 N번째 요일 휴무처럼 단순 요일로 표현 불가한 케이스 → 요일 비우고 검수 플래그
  const complexClosure = /(매월|매주|격주|첫\s*번?째|두\s*번?째|세\s*번?째|네\s*번?째|둘째|셋째|넷째|\d\s*주\s*차|주말\s*제외\s*격주)/.test(noticeBlob);
  let scheduleWarn = false;
  if (complexClosure) { days = ''; scheduleWarn = true; }
  if (hasDayRestriction && days.split(',').filter(Boolean).length === 7) { days = ''; scheduleWarn = true; }
  if (/공휴/.test(noticeBlob) && excludeHoliday !== 'Y') scheduleWarn = true;
  return { id, url: `${BASE}/taste/${id}`, region, name, channel, platformCategory, address, deadline, content, hours, days, excludeHoliday, scheduleWarn };
}

// 정규화 + 제외 판정 → 스테이징 후보 or null(제외)
function normalizeItem(d, reqRegion = '서울') {
  const region = d.region || '';
  if (/랜덤픽/.test(region)) return { excluded: '배송형(랜덤픽)' };
  // area1(지역)을 명시적으로 지정해 수집하므로 태그 지역명 불일치로는 제외하지 않는다(전국 대응).
  // 통합 지역이 태그와 다름: 충청=충남/충북·세종, 전라=전북/전남, 경남에 울산 포함, 인천=인천/부천/부평 등.
  if (!d.address) return { excluded: '주소없음' };
  const override = CATEGORY_OVERRIDE.find(([re]) => re.test(d.name));
  const mapped = mapCategory(d.platformCategory || '', d.content, d.name);
  const cat = override ? override[1] : mapped.cat;
  const catFlagged = !override && mapped.flag;
  const flags = [];
  if (catFlagged) flags.push(d.platformCategory ? `카테고리확인(${d.platformCategory}→${cat})` : '카테고리확인');
  if (!d.channel) flags.push('채널확인');
  if (!d.days) flags.push('가능요일확인');
  if (d.scheduleWarn) flags.push('요일·공휴일 재확인(안내문)');
  return { item: { ...d, category: cat, flags: flags.join(' ') } };
}

const norm = (s) => (s || '').replace(/\s/g, '');
const chans = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

// 운영 매장/캠페인 맵 로드
async function loadDedupe(db) {
  const [pRes, cRes] = await Promise.all([
    db.execute('SELECT id, name FROM places'),
    db.execute('SELECT place_id, channels, deadline, hidden FROM campaigns'),
  ]);
  const placeByNorm = new Map();
  for (const p of pRes.rows) placeByNorm.set(norm(p.name), p);
  const campByPlace = new Map();
  for (const c of cRes.rows) {
    if (!campByPlace.has(c.place_id)) campByPlace.set(c.place_id, []);
    let ch = []; try { ch = JSON.parse(c.channels || '[]'); } catch (e) {}
    campByPlace.get(c.place_id).push({ channels: ch, deadline: c.deadline, hidden: c.hidden });
  }
  return { placeByNorm, campByPlace };
}
// 활성 채널중복이면 dup_active(스킵), 만료만 겹치면 renew, 채널 안겹치면 add_channel, 매장없으면 new_place
function classify(item, dedupe, today) {
  const p = dedupe.placeByNorm.get(norm(item.name));
  const csvCh = chans(item.channel);
  if (!p) return { status: 'new_place', matchedPlaceId: null };
  const existing = dedupe.campByPlace.get(p.id) || [];
  const active = existing.filter((c) => !c.hidden && (!c.deadline || c.deadline >= today));
  const activeCh = new Set(active.flatMap((c) => c.channels));
  const expiredCh = new Set(existing.filter((c) => c.hidden || (c.deadline && c.deadline < today)).flatMap((c) => c.channels));
  if (csvCh.some((c) => activeCh.has(c))) return { status: 'dup_active', matchedPlaceId: p.id };
  if (csvCh.some((c) => expiredCh.has(c))) return { status: 'renew', matchedPlaceId: p.id };
  return { status: 'add_channel', matchedPlaceId: p.id };
}

/**
 * 증분 수집 실행. { db, mode:'jeonche'|'all-seoul', limit } → 요약
 */
async function runDinnerqueen({ db, mode = 'jeonche', limit = 40, region = '서울', deadlineTs = 0 }) {
  const platform = '디너의여왕'; // scraped_items에 저장되는 표시용 플랫폼명(지역 무관)
  // 커서는 수집 범위별로 분리 — taste ID가 전 지역 공통 번호라, 커서 하나로 여러 범위 돌리면 낮은 ID가 스킵됨.
  // 서울 전체/전역=기존 키('디너의여왕'), 서울 특정 하위지역='디너의여왕:서울:하위지역', 그 외 지역='디너의여왕:지역'.
  const stateKey = (AREA2_BY_REGION[region] && AREA2_BY_REGION[region].includes(mode)) ? `디너의여왕:${region}:${mode}`
    : (region === '서울' ? '디너의여왕' : `디너의여왕:${region}`);
  const today = new Date().toISOString().slice(0, 10);

  const stRes = await db.execute({ sql: 'SELECT last_max_id FROM scrape_state WHERE platform = ?', args: [stateKey] });
  const lastMaxId = Number(stRes.rows[0]?.last_max_id || 0);

  const allIds = await collectIds(mode, region, lastMaxId);
  // 신규(커서 초과)를 '오름차순'으로 처리 → limit에 걸려 못 받은 상위 신규는 다음 실행에서 이어받음(스킵 방지)
  const newIds = allIds.filter((id) => id > lastMaxId).sort((a, b) => a - b);
  const targets = newIds.slice(0, limit);

  const dedupe = await loadDedupe(db);
  let staged = 0, excluded = 0, dupActive = 0, failed = 0;
  // 커서는 '연속으로 성공 처리한 대상의 최댓값'까지만 전진(과거: 목록 최댓값으로 점프 → 미처리 신규 영구 스킵 버그).
  // 실패가 나면 그 지점 이후는 커서를 올리지 않아 다음 실행에서 재시도(누락 방지).
  let cursorAdvance = lastMaxId, sawFail = false;

  let timedOut = false, processed = 0;
  for (let i = 0; i < targets.length; i++) {
    // 시간 예산 초과 시 중단 — 커서는 성공 구간까지만 전진하므로 못한 신규는 다음 실행에서 이어받음.
    if (deadlineTs && Date.now() > deadlineTs) { timedOut = true; break; }
    processed++;
    const id = targets[i];
    let ok = false;
    try {
      const html = await fetchText(`${BASE}/taste/${id}`);
      const d = scrapeDetail(html, id);
      const nz = normalizeItem(d, region);
      if (nz.excluded) { excluded++; ok = true; }
      else {
        const it = nz.item;
        const cls = classify(it, dedupe, today);
        if (cls.status === 'dup_active') { dupActive++; ok = true; } // 활성 중복은 스테이징 안 함
        else {
          const ins = await db.execute({
            sql: `INSERT OR IGNORE INTO scraped_items
              (platform, source_id, source_url, name, address, category, channel, content, deadline, hours, days, exclude_holiday, flags, dedupe_status, matched_place_id, status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
            args: [platform, id, it.url, it.name, it.address, it.category, it.channel, it.content, it.deadline || '',
              it.hours || '', it.days || '', it.excludeHoliday === 'Y' ? 1 : 0, it.flags || '', cls.status, cls.matchedPlaceId],
          });
          if (ins.rowsAffected > 0) staged++;
          ok = true;
        }
      }
    } catch (e) { failed++; }
    if (ok && !sawFail) cursorAdvance = id; // 실패 전까지의 연속 성공 구간만 커서 전진
    else if (!ok) sawFail = true;
    if (i < targets.length - 1) await sleep(300); // 상세 fetch 간 저빈도 딜레이(예의). 600→300ms로 처리량↑
  }

  const newCursor = Math.max(lastMaxId, cursorAdvance);
  await db.execute({
    sql: `INSERT INTO scrape_state (platform, last_max_id, last_run_at) VALUES (?, ?, datetime('now','+9 hours'))
          ON CONFLICT(platform) DO UPDATE SET last_max_id = excluded.last_max_id, last_run_at = excluded.last_run_at`,
    args: [stateKey, newCursor],
  });
  await db.execute({
    sql: `INSERT INTO scrape_runs (platform, cursor_from, cursor_to, fetched, staged, excluded, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [stateKey, lastMaxId, newCursor, processed, staged, excluded + dupActive,
      `mode=${mode} 지역=${region} 신규후보 ${newIds.length} 처리 ${processed}/${targets.length} (dup_active ${dupActive}, 실패 ${failed}${timedOut ? ', 시간초과중단' : ''})`],
  });

  return { platform, region, mode, cursorFrom: lastMaxId, cursorTo: newCursor, newCandidates: newIds.length, processed, remaining: Math.max(0, newIds.length - processed), staged, excluded, dupActive, failed, timedOut };
}

// ===== 포블로그 (4blog.net) =====
const FB_BASE = 'https://4blog.net';
// 포블로그 채널값 → 무협맵 채널(블로그/클립/인스타그램/릴스/유튜브). tiktok·threads·etc는 대응값 없어 '' (검수)
const FB_CH = { blog: '블로그', reels: '릴스', clip: '클립', insta: '인스타그램', instar21: '인스타그램', instagram: '인스타그램', youtube: '유튜브', youtube21: '유튜브', shorts: '유튜브' };
// 오늘오픈(오늘 신규) 지역 캠페인. location 필터는 부정확해서 전지역 받고 상세 주소로 서울만 거른다.
const fbListUrl = (offset, limit) => `${FB_BASE}/loadMoreDataCategory?offset=${offset}&limit=${limit}&category=today&category1=local&location=&location1=&search=&bid=`;
async function fbFetchList(offset, limit) {
  const res = await fetch(fbListUrl(offset, limit), { headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Referer: `${FB_BASE}/list/today` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const NAME_CH_SUFFIX = /\s*[(（](?:인스타그램|인스타|블로그|릴스|클립|유튜브|쇼츠|틱톡|스레드|reels|clip)[)）]\s*$/i;
function fbName(nm) {
  const m = String(nm || '').match(/^\[([^\]]*)\]\s*(.+)$/);
  let name = (m ? m[2] : String(nm || '')).replace(/\s*\d+\s*차\s*$/, '').replace(NAME_CH_SUFFIX, '').trim();
  return { region: m ? m[1] : '', name };
}
function fbDeadline(mmdd) {
  const m = String(mmdd || '').match(/(\d{1,2})\.(\d{1,2})/);
  if (!m) return '';
  const now = new Date(); let y = now.getFullYear(); const mo = +m[1], da = +m[2];
  if ((now - new Date(y, mo - 1, da)) > 45 * 86400000) y++;
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}
function fbParseDetail(html) {
  // 주소: campaigninfo '체험 장소' 라벨
  let address = '';
  const im = html.match(/campaigninfo-label"?>\s*체험\s*장소\s*<\/label>\s*<div class="campaigninfo-text"[^>]*>([\s\S]*?)<\/div>/);
  if (im) {
    const a = im[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').replace(/^\s*주소\s*/, '').trim();
    const am = a.match(/[가-힣][가-힣A-Za-z0-9\s\-]+?\d[\d\-]*(?:\s*[가-힣]+\s*\d[\d\-]*)*/);
    address = am ? am[0].trim() : '';
  }
  // 영업/이용시간·휴무·요일제약: 본문 free-text
  const txt = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' '));
  // 시간: 체험가능시간 > 블로거이용시간 > 이용시간 > 영업시간 (리뷰어 기준 우선)
  let hours = '';
  let m = txt.match(/체험\s*가능\s*시간\s*[:：]?\s*([0-9시분:~\-\s오전후]{3,40})/)
    || txt.match(/블로거\s*이용\s*시간\s*([0-9:~\-\s]+)/) || txt.match(/이용\s*시간\s*([0-9:~\-\s]+)/) || txt.match(/영업\s*시간\s*([0-9:~\-\s]+)/);
  if (m) hours = m[1].replace(/\s+/g, ' ').trim().slice(0, 60);
  // 포블로그 명시 필드: '체험 가능 요일' / '체험 불가능 요일(+공휴일)'
  let daysExplicit = '', holidayExplicit = '';
  const av = txt.match(/체험\s*가능\s*요일\s*[:：]?\s*([월화수목금토일\s\/,·]+)/);
  const un = txt.match(/체험\s*불가능?\s*요일\s*[:：]?\s*([월화수목금토일\s\/,·.]*(?:공휴일)?)/);
  if (av || un) {
    const avSet = new Set(av ? (av[1].match(/[월화수목금토일]/g) || []) : ALL_DAYS);
    const unSet = new Set(un ? (un[1].match(/[월화수목금토일]/g) || []) : []);
    daysExplicit = ALL_DAYS.filter((d) => avSet.has(d) && !unSet.has(d)).join(',');
    if (un && /공휴일/.test(un[1])) holidayExplicit = 'Y';
  }
  // 휴무 + 요일불가(중간어 허용)
  let closedRaw = '';
  m = txt.match(/휴무일\s*[:：]?\s*([가-힣0-9,·\s]{0,25})/); if (m) closedRaw = m[1].replace(/\s+/g, ' ').trim();
  const bans = (txt.match(/(?<![가-힣])[월화수목금토일][월화수목금토일요,\s및]*\s*(?:[가-힣]{1,4}\s*){0,2}(?:불가|휴무|제외)/g) || []).join(' ');
  if (bans) closedRaw += ' ' + bans;
  // 모집 마감일: 캘린더 '리뷰어 모집' end. FullCalendar end는 exclusive(마지막날 다음날)이라 −1일 = 실제 모집 마감.
  // (end 그대로면 선정일이 됨 — 모집 13일까지 / 선정 14일)
  let deadline = '';
  const cal = html.match(/title\s*:\s*["'][^"']*모집[^"']*["']\s*,\s*start\s*:\s*["'][\d\-]+["']\s*,\s*end\s*:\s*["']([\d\-]{8,10})["']/);
  if (cal) {
    const dt = new Date(cal[1] + 'T00:00:00');
    dt.setDate(dt.getDate() - 1);
    deadline = dt.toISOString().slice(0, 10);
  }
  return { address, hours, closedRaw, daysExplicit, holidayExplicit, deadline };
}

async function runFoblog({ db, limit = 40 }) {
  const platform = '포블로그';
  const today = new Date().toISOString().slice(0, 10);
  const stRes = await db.execute({ sql: 'SELECT last_max_id FROM scrape_state WHERE platform = ?', args: [platform] });
  const lastMaxId = Number(stRes.rows[0]?.last_max_id || 0);

  // 오늘오픈 목록(전지역 소량)을 받아 커서 이후 신규만. 서울 여부는 상세 주소로 판정.
  const newItems = []; let offset = 0;
  while (offset < 90) {
    let batch;
    try { batch = await fbFetchList(offset, 30); } catch (e) { break; }
    if (!batch || !batch.length) break;
    for (const it of batch) {
      const cid = Number(it.CID);
      if (cid > lastMaxId && (it.CATEGORY1 || 'local') === 'local') newItems.push(it);
    }
    if (batch.length < 30) break; // 마지막 페이지
    offset += 30;
    await sleep(600);
  }
  const targets = newItems.sort((a, b) => Number(a.CID) - Number(b.CID)).slice(0, limit); // 오름차순: limit 초과분은 다음 실행에서 이어받음(스킵 방지)

  const dedupe = await loadDedupe(db);
  let staged = 0, excluded = 0, dupActive = 0, failed = 0;
  // 커서는 '연속 성공 처리한 CID 최댓값'까지만 전진(과거: maxSeen으로 점프 → 미처리 신규 영구 스킵 버그)
  let cursorAdvance = lastMaxId, sawFail = false;

  for (let i = 0; i < targets.length; i++) {
    const it = targets[i];
    const cid = Number(it.CID);
    let ok = false;
    try {
      const { name } = fbName(it.CAMPAIGN_NM);
      const channel = FB_CH[String(it.CATEGORY || '').toLowerCase()] || '';
      const content = cleanContent(String(it.REVIEWER_BENEFIT || ''));
      const html = await fetchText(`${FB_BASE}/campaign/${it.CID}/`);
      const { address, hours: rawHours, closedRaw, daysExplicit, holidayExplicit, deadline: dlCal } = fbParseDetail(html);
      if (!address || !/^서울/.test(address)) { excluded++; ok = true; } // 주소 없거나 서울 아님
      else {
        const deadline = dlCal || fbDeadline(it.REQ_CLOSE_DT); // 캘린더 '리뷰어 모집' 종료일 우선
        const days = daysExplicit || deriveDays(rawHours, closedRaw);       // 포블로그 명시 요일 우선
        const hours = cleanHours(rawHours);
        const excludeHoliday = holidayExplicit || parseExcludeHoliday(rawHours, closedRaw);
        const auto = categoryByKeyword(String(it.KEYWORD || '') + ' ' + content, name);
        const category = auto || '음식점';
        const flags = [];
        if (!auto) flags.push('카테고리확인(기본값 음식점)');
        if (!channel) flags.push('채널확인');
        if (!days) flags.push('가능요일확인');
        const item = { name, url: `${FB_BASE}/campaign/${it.CID}/`, channel, category, address, deadline, content, hours, days, excludeHoliday, flags: flags.join(' ') };
        const cls = classify(item, dedupe, today);
        if (cls.status === 'dup_active') { dupActive++; ok = true; }
        else {
          const ins = await db.execute({
            sql: `INSERT OR IGNORE INTO scraped_items
              (platform, source_id, source_url, name, address, category, channel, content, deadline, hours, days, exclude_holiday, flags, dedupe_status, matched_place_id, status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
            args: [platform, Number(it.CID), item.url, name, address, category, channel, content, deadline || '',
              hours || '', days || '', excludeHoliday === 'Y' ? 1 : 0, item.flags || '', cls.status, cls.matchedPlaceId],
          });
          if (ins.rowsAffected > 0) staged++;
          ok = true;
        }
      }
    } catch (e) { failed++; }
    if (ok && !sawFail) cursorAdvance = cid; // 실패 전까지의 연속 성공 구간만 커서 전진
    else if (!ok) sawFail = true;
    if (i < targets.length - 1) await sleep(600);
  }

  const newCursor = Math.max(lastMaxId, cursorAdvance);
  await db.execute({
    sql: `INSERT INTO scrape_state (platform, last_max_id, last_run_at) VALUES (?, ?, datetime('now','+9 hours'))
          ON CONFLICT(platform) DO UPDATE SET last_max_id = excluded.last_max_id, last_run_at = excluded.last_run_at`,
    args: [platform, newCursor],
  });
  await db.execute({
    sql: `INSERT INTO scrape_runs (platform, cursor_from, cursor_to, fetched, staged, excluded, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [platform, lastMaxId, newCursor, targets.length, staged, excluded + dupActive, `신규후보 ${newItems.length} 처리 ${targets.length} (dup_active ${dupActive}, 실패 ${failed})`],
  });
  return { platform, cursorFrom: lastMaxId, cursorTo: newCursor, newCandidates: newItems.length, processed: targets.length, staged, excluded, dupActive, failed };
}

// 플랫폼 디스패처
async function runScrape({ db, platform, mode, limit, region, deadlineTs }) {
  if (platform === 'foblog' || platform === '포블로그') return runFoblog({ db, limit });
  if (platform === 'gangnam' || platform === '강남맛집') return runGangnam({ db, limit, deadlineTs });
  return runDinnerqueen({ db, mode, limit, region, deadlineTs });
}

// 승인 대기(pending) 항목을 현재(개선된) 파서로 재파싱해 요일/시간/주소/공휴일/카테고리 갱신.
// 매장명·내용·채널·마감은 유지(손실 없음). 파서 개선 후 기존 스테이징 보정용.
async function reparsePending({ db, platform, only }) {
  const isFb = platform === 'foblog' || platform === '포블로그';
  const plat = isFb ? '포블로그' : '디너의여왕';
  const rows = (await db.execute({ sql: "SELECT * FROM scraped_items WHERE status='pending' AND platform=?", args: [plat] })).rows;
  let updated = 0, failed = 0;
  for (const r of rows) {
    try {
      let address, hours, days, excludeHoliday, category = r.category, deadline = r.deadline;
      if (isFb) {
        const html = await fetchText(r.source_url);
        const p = fbParseDetail(html);
        address = p.address || r.address;
        hours = cleanHours(p.hours);
        days = p.daysExplicit || deriveDays(p.hours, p.closedRaw);
        excludeHoliday = p.holidayExplicit || parseExcludeHoliday(p.hours, p.closedRaw);
        category = categoryByKeyword(String(r.content || ''), r.name) || r.category;
        if (p.deadline) deadline = p.deadline;
      } else {
        const html = await fetchText(`${BASE}/taste/${r.source_id}`);
        const d = scrapeDetail(html, r.source_id);
        address = d.address || r.address;
        hours = d.hours; days = d.days; excludeHoliday = d.excludeHoliday;
        const mapped = mapCategory(d.platformCategory || '', d.content || r.content, r.name);
        category = mapped.cat || r.category;
        if (d.deadline) deadline = d.deadline;
      }
      if (only === 'deadline') {
        // 마감일만 보정(수동 수정한 요일/시간/카테고리는 그대로 둠)
        await db.execute({ sql: 'UPDATE scraped_items SET deadline=? WHERE id=?', args: [deadline || '', r.id] });
      } else {
        const name = String(r.name || '').replace(NAME_CH_SUFFIX, '').trim();
        await db.execute({
          sql: 'UPDATE scraped_items SET name=?, address=?, hours=?, days=?, exclude_holiday=?, category=?, deadline=? WHERE id=?',
          args: [name, address, hours || '', days || '', excludeHoliday === 'Y' ? 1 : 0, category, deadline || '', r.id],
        });
      }
      updated++;
    } catch (e) { failed++; }
    await sleep(500);
  }
  return { platform: plat, pending: rows.length, updated, failed };
}

// ===== 강남맛집 (강남맛집.net, xn--939au0g4vj8sq.net) — 그누보드 SSR =====
// 목록 AJAX(_list_cmp_main.php, list_num=N)이 카드에 매장명·지역·채널·방문형여부·제공내역·D-day를 다 담아
// 상세 fetch 없이 목록만으로 수집. 좌표는 오토파일럿이 매장명+지역으로 지오코딩. UNIQUE(platform,source_id)로 멱등.
const GN_BASE = 'https://xn--939au0g4vj8sq.net';
const GN_LIST_URL = GN_BASE + '/theme/go/_list_cmp_main.php';
const GN_CH = { blog: '블로그', clip: '클립', insta: '인스타그램', reels: '릴스', youtube: '유튜브' };

function gnParseCards(html) {
  const items = [];
  for (const m of html.matchAll(/<li class='list_item[^']*'[^>]*data-product='(\d+)'[\s\S]*?<\/li>/g)) {
    const card = m[0], id = Number(m[1]);
    const type = (/class='type'>([^<]+)</.exec(card) || [])[1] || '';               // 방문형/배송형
    const ch = ((/<em class='(blog|clip|insta|reels|youtube)'>/i.exec(card) || [])[1] || 'blog').toLowerCase();
    const title = ((/<dt class='tit'><a[^>]*>([^<]+)</.exec(card) || [])[1] || '').trim();  // "[인천 미추홀] 매장명"
    const benefit = ((/<dd class='sub_tit'>([^<]*)</.exec(card) || [])[1] || '').trim();     // 제공내역
    const dday = ((/class='day_c'>([^<]+)</.exec(card) || [])[1] || '').trim();
    const tm = title.match(/^\[([^\]]+)\]\s*(.+)$/);
    items.push({ id, type, channel: GN_CH[ch] || '블로그', region: tm ? tm[1].trim() : '', name: (tm ? tm[2] : title).trim(), benefit, dday });
  }
  return items;
}
// "N일 남음" → 오늘+N일(KST). 오늘 마감/임박 → 오늘. 불명 → ''(상시).
function gnDeadline(dday) {
  const m = String(dday).match(/(\d+)\s*일\s*남음/);
  if (m) return new Date(Date.now() + 9 * 3600e3 + Number(m[1]) * 86400e3).toISOString().slice(0, 10);
  if (/오늘|마감|임박|D-?\s*0|D-?DAY/i.test(dday)) return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return '';
}
async function gnFetchList(listNum = 500) {
  const res = await fetch(GN_LIST_URL, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `section=all&channel_v=&list_num=${listNum}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return gnParseCards(await res.text());
}
async function runGangnam({ db, limit = 500, deadlineTs = 0 }) {
  const platform = '강남맛집';
  const today = new Date().toISOString().slice(0, 10);
  const cards = await gnFetchList(Math.max(200, Math.min(1000, limit)));
  const visit = cards.filter((c) => c.type.includes('방문'));
  const dedupe = await loadDedupe(db);
  let staged = 0, excluded = 0, dupActive = 0, failed = 0, processed = 0, timedOut = false;
  for (const c of visit) {
    if (deadlineTs && Date.now() > deadlineTs) { timedOut = true; break; }
    processed++;
    if (!c.name) { excluded++; continue; }
    try {
      const deadline = gnDeadline(c.dday);
      const category = categoryByKeyword(c.benefit + ' ' + c.name, c.name) || '음식점';
      const cls = classify({ name: c.name, channel: c.channel }, dedupe, today);
      if (cls.status === 'dup_active') { dupActive++; continue; }
      const ins = await db.execute({
        sql: `INSERT OR IGNORE INTO scraped_items
          (platform, source_id, source_url, name, address, category, channel, content, deadline, hours, days, exclude_holiday, flags, dedupe_status, matched_place_id, status)
          VALUES (?,?,?,?,?,?,?,?,?,'','',0,'',?,?,'pending')`,
        args: [platform, c.id, GN_BASE + '/cp/?id=' + c.id, c.name, c.region, category, c.channel, c.benefit, deadline, cls.status, cls.matchedPlaceId],
      });
      if (ins.rowsAffected > 0) staged++;
    } catch (e) { failed++; }
  }
  await db.execute({
    sql: `INSERT INTO scrape_runs (platform, cursor_from, cursor_to, fetched, staged, excluded, note)
          VALUES ('강남맛집', 0, 0, ?, ?, ?, ?)`,
    args: [processed, staged, excluded + dupActive, `방문형 ${visit.length} 처리 ${processed} (dup_active ${dupActive}, 실패 ${failed}${timedOut ? ', 시간초과중단' : ''})`],
  });
  return { platform, newCandidates: visit.length, processed, staged, excluded, dupActive, failed, timedOut };
}

module.exports = { runDinnerqueen, runFoblog, runGangnam, runScrape, reparsePending, fbParseDetail, fbName, fbDeadline, SEOUL_AREA2, AREA2_BY_REGION, deriveDays, cleanHours, parseExcludeHoliday, scrapeDetail, gnFetchList };
