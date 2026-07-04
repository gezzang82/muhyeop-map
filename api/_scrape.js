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
const listUrl = (area2) => `${BASE}/taste?ct=${encodeURIComponent('지역')}&area1=${encodeURIComponent('서울')}&area2=${encodeURIComponent(area2)}`;
const SEOUL_AREA2 = ['강남/논현/압구정', '강동/천호', '강서/목동/마곡', '건대/왕십리', '관악/신림', '교대/사당', '노원/강북', '명동/이태원', '삼성/선릉', '서초/반포', '송파/잠실', '수유/동대문/중랑', '시청/남대문', '여의도/영등포/구로', '종로/대학로', '홍대/마포/신촌', '기타'];

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
  const hours = hm ? hm[1].replace(/\s+/g, ' ').trim().slice(0, 150) : '';
  let closedRaw = cm ? cm[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const bi = txt.indexOf('방문 및 예약');
  if (bi >= 0) {
    const be = txt.indexOf('방문 위치', bi);
    const block = txt.slice(bi, be > 0 ? be : bi + 800);
    const bans = (block.match(/[월화수목금토일][월화수목금토일요,\s및]*\s*(?:[가-힣]{1,4}\s*)?(?:체험|방문|이용)\s*(?:불가|휴무)/g) || []).join(' ');
    if (bans) closedRaw += ' ' + bans;
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
function deriveDays(hoursIn, closedIn) {
  const hours = (hoursIn || '').replace(/공휴일?/g, ' ').replace(/\s+/g, ' ');
  const closedRaw = (closedIn || '').replace(/공휴일?/g, ' ').replace(/\s+/g, ' ');
  let openSet;
  if (/매일|모든\s*요일|연중무휴|무휴/.test(hours)) {
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
  if (/공휴일?[^가-힣]{0,8}(체험\s*불가|불가|휴무|제외|불가능)|(체험\s*불가|불가|휴무|제외)[^가-힣]{0,10}공휴일?/.test(blob)) return 'Y';
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
  if (/원데이\s*클래스|클래스\s*체험|보컬|레슨|트레이닝|학원|공방|드로잉|플라워|캔들|공예|만들기|전시|관람|원데이클래스/.test(s)) return '문화';
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
async function collectIds(mode) {
  const idSet = new Set();
  if (mode === 'all-seoul') {
    for (const a2 of SEOUL_AREA2) {
      try {
        const h = await fetchText(listUrl(a2));
        [...h.matchAll(/\/taste\/(\d+)/g)].forEach((m) => idSet.add(parseInt(m[1], 10)));
      } catch (e) { /* skip region on error */ }
      await sleep(600);
    }
  } else {
    const h = await fetchText(listUrl('전체'));
    [...h.matchAll(/\/taste\/(\d+)/g)].forEach((m) => idSet.add(parseInt(m[1], 10)));
  }
  return [...idSet];
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
  const days = deriveDays(rawHours, closedRaw);
  const hours = cleanHours(rawHours);
  const excludeHoliday = parseExcludeHoliday(rawHours, closedRaw);
  const content = cleanContent(rawContent);
  return { id, url: `${BASE}/taste/${id}`, region, name, channel, platformCategory, address, deadline, content, hours, days, excludeHoliday };
}

// 정규화 + 제외 판정 → 스테이징 후보 or null(제외)
function normalizeItem(d) {
  const region = d.region || '';
  if (/랜덤픽/.test(region)) return { excluded: '배송형(랜덤픽)' };
  if (region && !region.startsWith('서울')) return { excluded: `비서울(${region})` };
  if (!d.address) return { excluded: '주소없음' };
  const override = CATEGORY_OVERRIDE.find(([re]) => re.test(d.name));
  const mapped = mapCategory(d.platformCategory || '', d.content, d.name);
  const cat = override ? override[1] : mapped.cat;
  const catFlagged = !override && mapped.flag;
  const flags = [];
  if (catFlagged) flags.push(d.platformCategory ? `카테고리확인(${d.platformCategory}→${cat})` : '카테고리확인');
  if (!d.channel) flags.push('채널확인');
  if (!d.days) flags.push('가능요일확인');
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
async function runDinnerqueen({ db, mode = 'jeonche', limit = 40 }) {
  const platform = '디너의여왕';
  const today = new Date().toISOString().slice(0, 10);

  const stRes = await db.execute({ sql: 'SELECT last_max_id FROM scrape_state WHERE platform = ?', args: [platform] });
  const lastMaxId = Number(stRes.rows[0]?.last_max_id || 0);

  const allIds = await collectIds(mode);
  const cursorTo = allIds.length ? Math.max(...allIds) : lastMaxId;
  const newIds = allIds.filter((id) => id > lastMaxId).sort((a, b) => b - a);
  const targets = newIds.slice(0, limit);

  const dedupe = await loadDedupe(db);
  let staged = 0, excluded = 0, dupActive = 0, failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const id = targets[i];
    try {
      const html = await fetchText(`${BASE}/taste/${id}`);
      const d = scrapeDetail(html, id);
      const nz = normalizeItem(d);
      if (nz.excluded) { excluded++; continue; }
      const it = nz.item;
      const cls = classify(it, dedupe, today);
      if (cls.status === 'dup_active') { dupActive++; continue; } // 활성 중복은 스테이징 안 함
      const ins = await db.execute({
        sql: `INSERT OR IGNORE INTO scraped_items
          (platform, source_id, source_url, name, address, category, channel, content, deadline, hours, days, exclude_holiday, flags, dedupe_status, matched_place_id, status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
        args: [platform, id, it.url, it.name, it.address, it.category, it.channel, it.content, it.deadline || '',
          it.hours || '', it.days || '', it.excludeHoliday === 'Y' ? 1 : 0, it.flags || '', cls.status, cls.matchedPlaceId],
      });
      if (ins.rowsAffected > 0) staged++;
    } catch (e) { failed++; }
    if (i < targets.length - 1) await sleep(600);
  }

  const newCursor = Math.max(lastMaxId, cursorTo);
  await db.execute({
    sql: `INSERT INTO scrape_state (platform, last_max_id, last_run_at) VALUES (?, ?, datetime('now','+9 hours'))
          ON CONFLICT(platform) DO UPDATE SET last_max_id = excluded.last_max_id, last_run_at = excluded.last_run_at`,
    args: [platform, newCursor],
  });
  await db.execute({
    sql: `INSERT INTO scrape_runs (platform, cursor_from, cursor_to, fetched, staged, excluded, note)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [platform, lastMaxId, newCursor, targets.length, staged, excluded + dupActive,
      `mode=${mode} 신규후보 ${newIds.length} 처리 ${targets.length} (dup_active ${dupActive}, 실패 ${failed})`],
  });

  return { platform, mode, cursorFrom: lastMaxId, cursorTo: newCursor, newCandidates: newIds.length, processed: targets.length, staged, excluded, dupActive, failed };
}

module.exports = { runDinnerqueen };
