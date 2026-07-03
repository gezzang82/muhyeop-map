#!/usr/bin/env node
/**
 * 디너의여왕 수집 원본(dinnerqueen_raw.json) → 검수 정규화 → 최종 CSV
 *
 * 역할: 스크래퍼가 뽑은 사실 필드를 무협맵 업로드 기준으로 다듬는 "검수 패스".
 *  - 매장 시딩에 부적합한 건 제외(배송형 랜덤픽 / 비서울 / 주소없음)
 *  - 카테고리 확정, 협찬내용 아티팩트 제거
 *  - 사이트 재접속 없이 raw JSON만 사용 → 몇 번이고 재실행 가능
 *  - 최종 반영은 반드시 사람이 CSV 검토 후 어드민 업로드로만.
 *
 * 사용법: node scripts/normalize-dinnerqueen.js
 * 산출: scrape_out/dinnerqueen_final.csv (업로드용), scrape_out/dinnerqueen_excluded.csv (제외/보류 목록)
 */
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, '..', 'scrape_out');
const raw = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'dinnerqueen_raw.json'), 'utf-8'));

function cleanContent(c) {
  if (!c) return '';
  return c
    .replace(/qz-[a-z-]+/gi, ' ')
    .replace(/해당 캠페인은[^.]*합니다\.?/g, ' ')
    .replace(/(\s*\+\s*){2,}/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

function category(content, name) {
  const s = content + ' ' + name;
  if (/사주|타로|운세|점집|신점|철학관|작명|무속|명리|손금|관상/.test(s)) return '기타';
  if (/원데이\s*클래스|클래스\s*체험|보컬|레슨|트레이닝|학원|공방|드로잉|플라워|캔들|공예|만들기|전시|관람|원데이클래스/.test(s)) return '문화';
  if (/케이크|디저트|베이커리|커피|브런치|룸카페|스터디카페|카페/.test(s)) return '카페';
  if (/네일|피부|왁싱|헤어|미용|에스테틱|마사지|태닝|속눈썹|반영구|필러|보톡스|두피|체형|다이어트|\b펌\b|염색|풋앤바디|풋마사지|발마사지|타이마사지|스웨디시|아로마|경락|림프|바디케어|스킨케어|피부관리/.test(s)) return '뷰티';
  if (/숙박|호텔|모텔|펜션|글램핑|카라반|풀빌라|리조트|게스트하우스|한옥스테이|캠핑/.test(s)) return '숙박/여가'; // 잠자는 곳만
  // ※ '이용권·세트·체험권·코스·디너·런치·메뉴·술·바' 같은 generic 단어는 비음식 매장도 매칭돼
  //   조용한 오분류를 유발하므로 제외. 실제 음식 키워드만 확정, 나머지는 기본값+검수플래그로.
  if (/식사|한우|고기|맛집|정육|초밥|스시|오마카세|파스타|삼겹|국밥|치킨|피자|족발|해산물|일식|중식|양식|한식|뷔페|음식|식당|쌀국수|국수|분식|포차|이자카야|와인|샴페인|맥주|칵테일|하이볼|고깃집|횟집|수산|장어|곱창|막창|전골|찜닭|매운탕|감자탕|갈비탕|양꼬치|돈까스|샐러드|버거|정식|식닭|짬뽕|마라탕|보쌈|덮밥|찌개|라멘|우동|카츠/.test(s)) return '음식점';
  return ''; // 그래도 미상이면 기본값(음식점)+검수플래그로 사람이 확인
}

// 디너의여왕 자체 카테고리(맛집/뷰티/여가/배송) → 무협맵 카테고리 매핑 (내용/이름 키워드로 세분화)
function mapCategory(platformCat, content, name) {
  const s = content + ' ' + name;
  // 헬스/피트니스/PT는 플랫폼 카테고리(뷰티로 잡히기도)와 무관하게 기타(무협맵에 피트니스 없음)
  if (/헬스|피트니스|퍼스널\s*트레이닝|\bPT\b/i.test(s)) return { cat: '기타', flag: false };
  if (platformCat === '뷰티') return { cat: '뷰티', flag: false };
  if (platformCat === '맛집') {
    if (/카페|디저트|케이크|베이커리|커피|브런치|빙수|마카롱|도넛|와플|타르트|아이스크림|젤라또|스무디|밀크티|버블티|베이글|크로플|휘낭시에|쿠키/.test(s)) return { cat: '카페', flag: false };
    return { cat: '음식점', flag: false };
  }
  if (platformCat === '여가') {
    if (/숙박|호텔|모텔|펜션|글램핑|카라반|풀빌라|캠핑|리조트|게스트하우스|한옥스테이|독채|\b스테이\b/.test(s)) return { cat: '숙박/여가', flag: false }; // 잠자는 곳만
    if (/헬스|피트니스|필라테스|요가|골프|클라이밍|스크린골프|퍼스널트레이닝|\bPT\b/i.test(s)) return { cat: '기타', flag: false };
    if (/사주|타로|운세|점집|신점|철학관|작명/.test(s)) return { cat: '기타', flag: false };
    return { cat: '문화', flag: true }; // 파티룸·체험·전시 등 → 문화(검수 권장)
  }
  if (platformCat === '배송') return { cat: '기타', flag: true }; // 대개 제외 대상
  const auto = category(content, name); // 플랫폼 카테고리 없으면 키워드 fallback
  return { cat: auto || '음식점', flag: !auto };
}

// 이름 기반 카테고리 수동 보정(자동분류가 판단 어려운 특정 매장). 발견 시 추가.
const CATEGORY_OVERRIDE = [
  [/프리즘\s*홍대점/, '기타'],   // 헬스장
  [/에뚜왈\s*가로수길점/, '카페'], // 디저트 카페
  [/부타캣\s*강서점/, '문화'],     // 고양이 카페/체험
];

const rowsOut = [];
const excluded = [];

for (const r of raw) {
  if (r.error) { excluded.push([r.id, r.url, '수집실패', r.error]); continue; }
  const region = r.region || '';
  // 1) 배송형 랜덤픽 제외
  if (/랜덤픽/.test(region)) { excluded.push([r.id, r.url, '배송형(랜덤픽)', r.name]); continue; }
  // 2) 비서울 제외
  if (region && !region.startsWith('서울')) { excluded.push([r.id, r.url, `비서울(${region})`, r.name]); continue; }
  // 3) 주소 없으면 좌표변환 불가 → 보류
  if (!r.address) { excluded.push([r.id, r.url, '주소없음(수동확인)', r.name]); continue; }

  const content = cleanContent(r.content);
  const override = CATEGORY_OVERRIDE.find(([re]) => re.test(r.name));
  const mapped = mapCategory(r.platformCategory || '', content, r.name);
  const cat = override ? override[1] : mapped.cat; // 디너의여왕 카테고리 우선, override 최상위
  const catFlagged = !override && mapped.flag;

  rowsOut.push({
    name: r.name, address: r.address, category: cat, platform: '디너의여왕',
    channel: r.channel || '', content, deadline: r.deadline || '',
    hours: r.hours || '', days: r.days || '', holiday: r.excludeHoliday || '',
    url: r.url, naver: r.naverLink || '', catFlagged, platformCategory: r.platformCategory || '', id: r.id,
  });
}

// 디너의여왕은 채널마다 별도 캠페인 → 병합하지 않고 채널별 개별 행 유지.
// (업로드 시 매장명 dedup으로 1매장 + 여러 캠페인이 됨)
const finalRows = rowsOut.map((r) => {
  const note = [];
  if (r.catFlagged) note.push(r.platformCategory ? `카테고리확인(${r.platformCategory}→${r.category})` : '카테고리확인(기본값 음식점)');
  if (!r.channel) note.push('채널확인');
  if (!r.content) note.push('내용확인');
  if (!r.days) note.push('가능요일확인');
  return {
    name: r.name, address: r.address, category: r.category, platform: '디너의여왕',
    channel: r.channel, content: r.content, deadline: r.deadline, hours: r.hours, days: r.days,
    holiday: r.holiday || '', url: r.url, naver: r.naver, note: note.join(' '),
  };
});

// CSV 유틸
const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const BOM = '﻿';

const header = ['매장명', '주소', '카테고리', '플랫폼', '채널', '협찬내용', '마감일', '영업시간', '가능요일', '공휴일불가', '출처URL', '_지도링크', '_검수메모'];
const lines = [header.join(',')];
for (const r of finalRows) {
  lines.push([r.name, r.address, r.category, r.platform, r.channel, r.content, r.deadline, r.hours, r.days, r.holiday, r.url, r.naver, r.note].map(esc).join(','));
}
fs.writeFileSync(path.join(OUT_DIR, 'dinnerqueen_final.csv'), BOM + lines.join('\r\n'));

const exLines = ['ID,URL,제외사유,매장명'];
for (const e of excluded) exLines.push(e.map(esc).join(','));
fs.writeFileSync(path.join(OUT_DIR, 'dinnerqueen_excluded.csv'), BOM + exLines.join('\r\n'));

const needReview = finalRows.filter((r) => r.note).length;
console.log(`[정규화 완료] 업로드 후보 ${finalRows.length}건 (채널별 개별, 검수메모 ${needReview}건) / 제외 ${excluded.length}건`);
console.log('  →', path.join(OUT_DIR, 'dinnerqueen_final.csv'));
console.log('  →', path.join(OUT_DIR, 'dinnerqueen_excluded.csv'));
console.log('\n[제외 목록]');
for (const e of excluded) console.log('  ', e[0], e[2], '-', e[3]);
