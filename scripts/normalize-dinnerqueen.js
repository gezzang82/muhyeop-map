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
  if (/원데이\s*클래스|클래스\s*체험|보컬|레슨|트레이닝|학원|공방|드로잉|플라워|캔들|공예|만들기|전시|관람|원데이클래스/.test(s)) return '문화';
  if (/케이크|디저트|베이커리|커피|브런치|룸카페|스터디카페|카페/.test(s)) return '카페';
  if (/네일|피부|왁싱|헤어|미용|에스테틱|마사지|태닝|속눈썹|반영구|필러|보톡스|두피|체형|다이어트|\b펌\b|염색/.test(s)) return '뷰티';
  if (/숙박|호텔|펜션|글램핑|카라반|스파|워터파크|풀빌라|파티룸/.test(s)) return '숙박/여가';
  if (/식사|한우|고기|맛집|정육|초밥|스시|오마카세|파스타|삼겹|국밥|치킨|피자|족발|해산물|일식|중식|양식|한식|뷔페|음식|메뉴|식당|이용권|세트|쌀국수|국수|분식|술|바|포차|이자카야|와인|샴페인|맥주|칵테일|하이볼|고깃집|횟집|수산|장어|곱창|막창|전골|찜|탕|양꼬치|돈까스|샐러드|버거|디너|런치|코스|정식|체험권|식닭|짬뽕/.test(s)) return '음식점';
  return ''; // 그래도 미상이면 사람이
}

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
  const cat = category(content, r.name) || '음식점'; // 지역기반 캠페인 기본값
  const catFlagged = !category(content, r.name);

  rowsOut.push({
    name: r.name, address: r.address, category: cat, platform: '디너의여왕',
    channel: r.channel || '', content, deadline: r.deadline || '',
    hours: r.hours || '', days: r.days || '', holiday: '',
    url: r.url, naver: r.naverLink || '', catFlagged, id: r.id,
  });
}

// 디너의여왕은 채널마다 별도 캠페인 → 병합하지 않고 채널별 개별 행 유지.
// (업로드 시 매장명 dedup으로 1매장 + 여러 캠페인이 됨)
const finalRows = rowsOut.map((r) => {
  const note = [];
  if (r.catFlagged) note.push('카테고리기본값(음식점)-확인');
  if (!r.channel) note.push('채널확인');
  if (!r.content) note.push('내용확인');
  if (!r.days) note.push('가능요일확인');
  return {
    name: r.name, address: r.address, category: r.category, platform: '디너의여왕',
    channel: r.channel, content: r.content, deadline: r.deadline, hours: r.hours, days: r.days,
    holiday: '', url: r.url, naver: r.naver, note: note.join(' '),
  };
});

// CSV 유틸
const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const BOM = '﻿';

const header = ['매장명', '주소', '카테고리', '플랫폼', '채널', '협찬내용', '마감일', '영업시간', '가능요일', '공휴일불가', '_출처URL', '_지도링크', '_검수메모'];
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
