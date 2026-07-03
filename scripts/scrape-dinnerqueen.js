#!/usr/bin/env node
/**
 * 디너의여왕 서울 캠페인 수집기 (무협맵 시딩용)
 *
 * ⚠️ 사용 원칙 (docs/workflow.md · 자동수집 계획 메모 준수)
 *  - robots.txt 허용 범위(디너의여왕: Allow /) 안에서만, 저빈도로만 수집한다.
 *  - 사실 필드만 가져오고, 협찬내용은 이후 AI/사람 검수 단계에서 요약·재작성한다(원문 복붙 금지).
 *  - 산출 CSV는 반드시 사람이 검토한 뒤 어드민 엑셀 업로드로만 반영한다.
 *  - 우리 운영 DB에는 직접 쓰지 않는다(이 스크립트는 외부 읽기 + 파일 출력만).
 *
 * 사용법:
 *   node scripts/scrape-dinnerqueen.js [limit]
 *   limit 생략 시 서울 목록 첫 렌더 전량(약 37건). 예: node scripts/scrape-dinnerqueen.js 5
 *
 * 산출물: scrape_out/dinnerqueen_raw.json, scrape_out/dinnerqueen_draft.csv
 */

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BASE = 'https://dinnerqueen.net';
const LIST_URL = `${BASE}/taste?ct=${encodeURIComponent('지역')}&area1=${encodeURIComponent('서울')}&area2=${encodeURIComponent('전체')}`;
const DELAY_MS = 1500; // 저빈도 예의
const OUT_DIR = path.join(__dirname, '..', 'scrape_out');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// --- 파싱 헬퍼 ---
function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function metaContent(html, prop) {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? m[1] : '';
}

// og:title 예: "디너의여왕 - [서울 은평][릴스] 오늘은정육식당 17차"
function parseTitle(ogTitle) {
  let t = ogTitle.replace(/^디너의여왕\s*-\s*/, '').trim();
  const brackets = [...t.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
  const region = brackets[0] || '';
  const channelRaw = brackets[1] || '';
  let name = t.replace(/\[[^\]]*\]/g, '').trim();
  name = name.replace(/\s*\d+\s*차\s*$/, '').trim(); // "17차" 제거
  return { region, channelRaw, name };
}

// 채널은 og:title이 아니라 상세 타이틀 영역의 아이콘 CSS 클래스로 판별한다.
// (디너의여왕은 블로그판만 title에 채널 태그를 안 붙임)
//  sns-nv-blog=블로그 / reels=릴스 / clip=클립 / sns-ins=인스타그램 / youtube=유튜브
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
  return ch.join(','); // 대개 1개, 복수면 콤마
}

function parseAddress(html, storeName) {
  // 1순위: 본문 "방문 위치: <주소>" (화면 표기 주소)
  const txt = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  let m = txt.match(/방문\s*위치\s*[:：]\s*([가-힣][가-힣A-Za-z0-9\s\-]+?\d[\d\-]*)\b/);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  // 2순위: HTML 주석의 상세주소
  m = html.match(/주석처리\.\s*([가-힣0-9][가-힣A-Za-z0-9\s\-]+?)\s*-->/);
  if (!m) return '';
  let addr = m[1].replace(/\s+/g, ' ').trim();
  if (storeName && addr.endsWith(storeName)) addr = addr.slice(0, -storeName.length).trim();
  return addr;
}

// 체험 시간(영업시간) / 휴무일 원문
function parseVisit(html) {
  const txt = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  const hm = txt.match(/체험\s*시간\s*[:：]?\s*(.+?)(?=\s*휴무일|\s*방문\s*위치|\s*해당\s*캠페인|$)/);
  const cm = txt.match(/휴무일\s*[:：]?\s*(.+?)(?=\s*방문\s*위치|\s*해당\s*캠페인|\s*예약\s*문의|$)/);
  const hours = hm ? hm[1].replace(/\s+/g, ' ').trim().slice(0, 150) : '';
  const closedRaw = cm ? cm[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return { hours, closedRaw };
}

// 요일 파싱 유틸 (일요일 시작 순서: 범위 "일~목" 자연스럽게 처리)
const ALL_DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function daysFromText(t) {
  // "월,금,토", "월요일", "일~목", "주말", "평일" → Set(요일)
  const set = new Set();
  if (/주말/.test(t)) { set.add('토'); set.add('일'); }
  if (/평일/.test(t)) ['월', '화', '수', '목', '금'].forEach((d) => set.add(d));
  // 범위 "A~B" (예: 일~목, 월~금)
  for (const m of t.matchAll(/([월화수목금토일])\s*[~\-–]\s*([월화수목금토일])/g)) {
    let a = WEEK.indexOf(m[1]); const b = WEEK.indexOf(m[2]);
    for (let k = 0; k < 7; k++) { const idx = (a + k) % 7; set.add(WEEK[idx]); if (WEEK[idx] === m[2]) break; }
  }
  // 개별 요일 토큰
  for (const d of ALL_DAYS) if (new RegExp(`(^|[^가-힣])${d}(요일)?([^가-힣~\\-–]|$)`).test(t)) set.add(d);
  return set;
}

// 가능요일 = (영업요일 집합) − (체험불가/휴무 요일).
//  - 영업요일: 체험시간에서 "매일/모든요일" → 전체, "월~금"·"금,토"·"평일"·"주말" 등 → 해당 요일.
//    (체험불가 구간은 영업요일 계산에서 먼저 제거해 섞이지 않게)
//  - 체험불가: 체험시간의 "★체험불가 : X" + 휴무일 필드.
// 확신 못하면 '' 반환(어드민이 전체 기본으로 처리)
// 체험불가/휴무 요일 마커: 마커 "뒤" (체험불가 : 월,금,토) 와 "앞" (주말체험 불가) 모두 대응
const CLOSED_AFTER = /(?:체험\s*불가|불가|휴무일?|휴무)\s*[:：\-]?\s*([월화수목금토일,\s~\-–]*)/g;
const CLOSED_BEFORE = /(주말|평일|[월화수목금토일][월화수목금토일,\s~\-–]*)\s*(?:체험\s*)?(?:불가|휴무)/g;
function collectClosed(text) {
  const set = new Set();
  for (const m of text.matchAll(CLOSED_AFTER)) daysFromText(m[1]).forEach((d) => set.add(d));
  for (const m of text.matchAll(CLOSED_BEFORE)) daysFromText(m[1]).forEach((d) => set.add(d));
  return set;
}
function deriveDays(hours, closedRaw) {
  // 1) 영업요일 집합 (체험불가 구간은 먼저 제거해 영업요일로 오인 방지)
  let openSet;
  if (/매일|모든\s*요일|연중무휴|무휴/.test(hours)) {
    openSet = new Set(ALL_DAYS);
  } else {
    const openText = hours.replace(CLOSED_BEFORE, ' ').replace(CLOSED_AFTER, ' ');
    const s = daysFromText(openText);
    openSet = s.size ? s : new Set(ALL_DAYS); // 요일 정보 없으면 전체로 두고 휴무일로만 차감
  }
  // 2) 체험불가 요일 = 체험시간 마커(앞뒤) + 휴무일 필드
  const closed = collectClosed(hours);
  daysFromText(closedRaw).forEach((d) => closed.add(d));

  const avail = ALL_DAYS.filter((d) => openSet.has(d) && !closed.has(d));
  if (avail.length === 0) return '';       // 모순/불명 → 비움
  return avail.join(',');
}

// 영업시간 표시 정리: 시간대가 1개뿐이면(모든 가능요일이 같은 시간) 요일 표기는
// 가능요일과 겹치므로 떼고 시간만 남긴다. 시간대가 2개↑면(요일별 시간이 다름) 원문 유지.
const TIME_RE = /\d{1,2}\s*[:시]\s*\d{0,2}\s*[~\-–]\s*[^\d~]{0,6}\d{1,2}/g;
function stripDayClosed(text) {
  // 요일 기반 체험불가만 제거(시간 기반 "18시 체험불가" 등은 보존)
  return text
    .replace(CLOSED_BEFORE, (m, g) => (daysFromText(g).size ? ' ' : m))
    .replace(CLOSED_AFTER, (m, g) => (daysFromText(g).size ? ' ' : m));
}
function cleanHours(hours) {
  if (!hours) return '';
  const times = hours.match(TIME_RE) || [];
  if (times.length !== 1) return hours.replace(/\s+/g, ' ').trim(); // 0 or 여러 시간대 → 원문 유지
  let h = stripDayClosed(hours);
  // 선두 요일 표기 제거: "주말, 월요일", "월~금", "금,토", "평일", "일~목 :" 등
  h = h.replace(/^[\s★•\-]*(?:주말|평일|매일|모든\s*요일|[월화수목금토일])[월화수목금토일요주말평일및,\s~\-–]*\s*[:：]?\s*/, '');
  return h.replace(/\s+/g, ' ').replace(/[\s★•\-:：]+$/, '').trim();
}

function parseDeadline(html) {
  // 신청기간 첫 셀: "26.07.03 – 26.07.09" → 종료일 2026-07-09
  const m = html.match(/(\d{2})\.(\d{2})\.(\d{2})\s*[–\-~]\s*(\d{2})\.(\d{2})\.(\d{2})/);
  if (m) return `20${m[4]}-${m[5]}-${m[6]}`;
  return '';
}

function parseContent(html) {
  const txt = stripTags(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  const i = txt.indexOf('제공 내역');
  if (i < 0) return '';
  let seg = txt.slice(i + 5);
  // "참여 전 필수 확인사항" 이전까지가 제공내역
  const cut = seg.search(/참여\s*전|필수\s*확인|유의사항|주의사항/);
  if (cut > 0) seg = seg.slice(0, cut);
  return seg.replace(/^내역\s*/, '').replace(/(\s*\+\s*){2,}/g, ' + ').trim().slice(0, 300);
}

function parseNaverLink(html) {
  const m = html.match(/https:\/\/naver\.me\/[A-Za-z0-9]+/);
  return m ? m[0] : '';
}

function guessCategory(content, name) {
  const s = (content + ' ' + name);
  if (/카페|디저트|베이커리|커피|브런치|룸카페|스터디카페/.test(s)) return '카페';
  if (/네일|피부|왁싱|헤어|미용|에스테틱|마사지|태닝|속눈썹|반영구|필러|보톡스|두피|체형|다이어트/.test(s)) return '뷰티';
  if (/숙박|호텔|펜션|글램핑|카라반|스파|워터파크|풀빌라|파티룸/.test(s)) return '숙박/여가';
  if (/식사|한우|고기|맛집|정육|초밥|스시|오마카세|파스타|삼겹|국밥|치킨|피자|족발|해산물|일식|중식|양식|한식|뷔페|음식|메뉴|식당|이용권|세트|쌀국수|국수|분식|술|바|포차|이자카야|와인|맥주|칵테일|하이볼|고깃집|횟집|장어|곱창|막창|전골|찜|탕|양꼬치|돈까스|샐러드|버거|햄버거|디너|런치|코스/.test(s)) return '음식점';
  return ''; // 미상 → 검수 플래그
}

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('[1] 서울 목록 로드:', LIST_URL);
  const listHtml = await fetchText(LIST_URL);
  const ids = [...new Set([...listHtml.matchAll(/\/taste\/(\d+)/g)].map((m) => parseInt(m[1], 10)))];
  ids.sort((a, b) => b - a); // id 내림차순 = 최신순 근사
  const targets = ids.slice(0, limit);
  console.log(`    고유 캠페인 ${ids.length}건 중 최신 ${targets.length}건 수집`);

  const rows = [];
  for (let i = 0; i < targets.length; i++) {
    const id = targets[i];
    const url = `${BASE}/taste/${id}`;
    try {
      const html = await fetchText(url);
      const og = metaContent(html, 'og:title');
      const { region, channelRaw, name } = parseTitle(og);
      const channel = parseChannel(html); // 아이콘 클래스 기반(정확)
      const address = parseAddress(html, name);
      const deadline = parseDeadline(html);
      const content = parseContent(html);
      const naverLink = parseNaverLink(html);
      const category = guessCategory(content, name);
      const { hours: rawHours, closedRaw } = parseVisit(html);
      const days = deriveDays(rawHours, closedRaw); // 요일은 원문 기준 산출
      const hours = cleanHours(rawHours);           // 표시는 요일 중복 제거

      const flags = [];
      if (!name) flags.push('매장명?');
      if (!address) flags.push('주소없음');
      if (!deadline) flags.push('마감일?');
      if (!content) flags.push('내용없음');
      if (!channel) flags.push('채널확인');
      if (!category) flags.push('카테고리확인');

      rows.push({ id, url, region, name, channelRaw, channel, category, address, deadline, content, hours, closedRaw, days, naverLink, ogTitle: og, flags });
      console.log(`    [${i + 1}/${targets.length}] ${id} ${name || '???'} | ${category || '?'} | ${channel || '?'} | ~${deadline || '?'} | ${days || '요일?'} ${flags.length ? '⚠ ' + flags.join(',') : '✓'}`);
    } catch (e) {
      console.log(`    [${i + 1}/${targets.length}] ${id} ERROR ${e.message}`);
      rows.push({ id, url, error: e.message, flags: ['수집실패'] });
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  // 원본 JSON
  fs.writeFileSync(path.join(OUT_DIR, 'dinnerqueen_raw.json'), JSON.stringify(rows, null, 2));

  // 초안 CSV (어드민 업로드 10컬럼 + 검수 보조 3컬럼)
  const header = ['매장명', '주소', '카테고리', '플랫폼', '채널', '협찬내용', '마감일', '영업시간', '가능요일', '공휴일불가', '출처URL', '_지도링크', '_검수플래그'];
  const csvEsc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    if (r.error) continue;
    lines.push([
      r.name, r.address, r.category, '디너의여왕', r.channel, r.content, r.deadline,
      r.hours || '', r.days || '', '', r.url, r.naverLink, (r.flags || []).join(' '),
    ].map(csvEsc).join(','));
  }
  const csv = '﻿' + lines.join('\r\n'); // UTF-8 BOM (Excel 한글)
  fs.writeFileSync(path.join(OUT_DIR, 'dinnerqueen_draft.csv'), csv);

  const ok = rows.filter((r) => !r.error).length;
  const clean = rows.filter((r) => !r.error && (!r.flags || r.flags.length === 0)).length;
  console.log(`\n[완료] 수집 ${ok}/${targets.length}건, 무결 ${clean}건, 검수필요 ${ok - clean}건`);
  console.log('  →', path.join(OUT_DIR, 'dinnerqueen_raw.json'));
  console.log('  →', path.join(OUT_DIR, 'dinnerqueen_draft.csv'));
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { deriveDays, daysFromText, parseTitle, parseChannel, parseVisit, cleanHours };
