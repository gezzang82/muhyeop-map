#!/usr/bin/env node
/**
 * 최종 CSV(dinnerqueen_final.csv)를 운영 DB와 대조해 업로드 안전본 생성.
 *  - 운영 매장/캠페인을 GET(읽기전용)으로만 조회 (쓰기 없음)
 *  - 분류: NEW매장 / 기존매장+새채널(추가OK) / 기존매장+채널중복(스킵)
 *  - 산출: scrape_out/dinnerqueen_upload.csv (채널중복 제외한 업로드본)
 *
 * 사용법: node scripts/dedupe-against-prod.js [base]
 *   base 기본값 https://muhyeop.com
 */
const fs = require('fs');
const path = require('path');
const OUT_DIR = path.join(__dirname, '..', 'scrape_out');
const BASE = process.argv[2] || 'https://muhyeop.com';
const TODAY = new Date().toISOString().slice(0, 10);

const norm = (s) => (s || '').replace(/\s/g, '');
const chans = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* skip */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}
const csvEsc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

async function main() {
  const [places, campaigns] = await Promise.all([
    fetch(`${BASE}/api/places`).then((r) => r.json()),
    fetch(`${BASE}/api/campaigns`).then((r) => r.json()),
  ]);
  const byNorm = new Map();
  for (const p of places) byNorm.set(norm(p.name), p);
  const campByPlace = new Map();
  for (const c of campaigns) { const k = c.placeId; if (!campByPlace.has(k)) campByPlace.set(k, []); campByPlace.get(k).push(c); }

  const csv = parseCsv(fs.readFileSync(path.join(OUT_DIR, 'dinnerqueen_final.csv'), 'utf-8').replace(/^﻿/, ''));
  const header = csv[0];
  const body = csv.slice(1);

  const isActive = (c) => !c.hidden && (!c.deadline || c.deadline >= TODAY);
  const keep = [header];
  const report = { newPlace: [], addChannel: [], renew: [], dupSkip: [] };
  const seenNewNames = new Set(); // 같은 업로드 내 신규매장 중복 방지(키움참치 2행)

  for (const r of body) {
    const name = r[0]; const csvCh = chans(r[4]);
    const p = byNorm.get(norm(name));
    if (!p) {
      report.newPlace.push(`${name} [${csvCh.join(',')}]${seenNewNames.has(norm(name)) ? ' (동일매장 추가채널)' : ''}`);
      seenNewNames.add(norm(name));
      keep.push(r);
      continue;
    }
    const existing = campByPlace.get(p.id) || [];
    const activeCh = new Set(existing.filter(isActive).flatMap((c) => chans(c.channels)));
    const expiredCh = new Set(existing.filter((c) => !isActive(c)).flatMap((c) => chans(c.channels)));
    const liveOverlap = csvCh.filter((c) => activeCh.has(c));

    if (liveOverlap.length) {
      // 활성 캠페인과 채널 겹침 → 진짜 중복 → 스킵
      report.dupSkip.push(`${name}: CSV[${csvCh.join(',')}] ↔ 활성[${[...activeCh].join(',')}] 겹침(${liveOverlap.join(',')})`);
    } else if (csvCh.some((c) => expiredCh.has(c))) {
      // 만료된 것만 겹침 → 갱신 → 유지
      report.renew.push(`${name}: [${csvCh.join(',')}] (기존 만료[${[...expiredCh].join(',')}] 갱신)`);
      keep.push(r);
    } else {
      // 기존 매장이지만 채널 겹침 없음 → 새 채널 추가
      report.addChannel.push(`${name}: +[${csvCh.join(',')}] (활성[${[...activeCh].join(',') || '없음'}])`);
      keep.push(r);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'dinnerqueen_upload.csv'), '﻿' + keep.map((r) => r.map(csvEsc).join(',')).join('\r\n'));

  const pr = (t, a) => { console.log(`\n■ ${t}: ${a.length}건`); a.forEach((x) => console.log('   ', x)); };
  console.log(`운영 매장 ${places.length} / 캠페인 ${campaigns.length} 대조 (기준일 ${TODAY})`);
  pr('신규 매장 생성', report.newPlace);
  pr('기존 매장 + 새 채널 추가(OK)', report.addChannel);
  pr('기존 만료 캠페인 갱신(유지)', report.renew);
  pr('활성 캠페인과 중복 → 업로드 제외', report.dupSkip);
  console.log(`\n[업로드본] ${keep.length - 1}건 → scrape_out/dinnerqueen_upload.csv (중복 ${report.dupSkip.length}건 제외)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
