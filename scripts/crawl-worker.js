#!/usr/bin/env node
/**
 * 로컬 크롤 워커 — 컴퓨터가 켜져 있는 동안 계속 수집 + AI 자동등록.
 *
 * Vercel(하루 1회·300초)의 한계를 우회한다. 서버 코드(api/_scrape·_autopilot)를 그대로
 * 재사용해 운영 Turso DB에 직접 반영하므로, Vercel 크론과 동일한 결과를 무제한으로 낸다.
 * 커서/auto_seen 기반이라 크론과 겹쳐 돌아도 안전(중복 적재는 UNIQUE로 무시).
 *
 * 실행:  node scripts/crawl-worker.js            (서울, 기본)
 *        node scripts/crawl-worker.js 서울,경기,부산,인천
 *        node scripts/crawl-worker.js 서울 45     (지역, 패스간 최소 대기초)
 * 멈춤:  Ctrl+C
 *
 * ⚠️ 운영 DB에 실제 등록한다(테스트 아님). .env.local 필요:
 *    TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NAVER_SEARCH_CLIENT_ID/SECRET(지오코딩),
 *    OPENAI_API_KEY(신규매장 AI 판정 — 없으면 신규매장은 전부 검수큐로 빠짐, 오등록은 없음)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// .env.local 로드
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { runScrape, SEOUL_AREA2, AREA2_BY_REGION } = require('../api/_scrape');
const { runAutopilot } = require('../api/_autopilot');

// 지역별 수집 단위(하위지역). '전체' 목록은 하위지역을 다 담지 않아 누락되므로 하위지역별로 순회한다.
//  서울=17개 하위지역, 경기=7개, 인천=경기>인천/부천/부평(collectIds가 매핑, mode=jeonche), 부산=전체(하위지역 미정의).
function subdistrictsFor(region) {
  if (region === '서울') return SEOUL_AREA2.map((a2) => ({ region, mode: a2 }));
  if (region === '경기') return AREA2_BY_REGION['경기'].map((a2) => ({ region, mode: a2 }));
  return [{ region, mode: 'jeonche' }]; // 인천(매핑됨)·부산 등
}

const regions = (process.argv[2] || '서울').split(',').map((s) => s.trim()).filter(Boolean);
const minWaitSec = Math.max(10, parseInt(process.argv[3], 10) || 30);
const IDLE_WAIT_SEC = 600; // 새로 긁을 게 없을 때 대기(10분)

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 19); // KST HH:MM:SS

let stopping = false;
process.on('SIGINT', () => { console.log('\n중단 요청 — 이번 패스 끝나고 종료합니다…'); stopping = true; });

async function pass() {
  let collected = 0, more = false, remaining = 0;
  for (const region of regions) {
    if (stopping) break;
    // 하위지역별로 순회 수집('전체' 목록이 하위지역을 다 안 담아서 누락되던 것 해결)
    for (const t of subdistrictsFor(region)) {
      if (stopping) break;
      const s = await runScrape({ db, platform: 'dinnerqueen', mode: t.mode, limit: 250, region: t.region });
      collected += s.staged || 0;
      if ((s.newCandidates || 0) > (s.processed || 0)) more = true; // 아직 못 긁은 신규 남음
      const label = t.mode === 'jeonche' ? t.region : `${t.region}>${t.mode}`;
      console.log(`  [${ts()}] 수집(${label}): 신규 ${s.newCandidates} · 처리 ${s.processed} · 적재 ${s.staged} · 중복 ${s.dupActive}`);
    }
    // 지역의 하위지역을 다 긁은 뒤 AI 검증·등록 1회
    const a = await runAutopilot({ db });
    remaining = a.remaining;
    console.log(`  [${ts()}] └ [${region}] AI검증: 자동등록 ${a.registered} · 검수 ${a.review} · 스킵 ${a.skipped} · 남은대기 ${a.remaining}`);
  }
  // 강남맛집 (목록 1회로 전국 방문형 수집 → 지역 순회 불필요)
  if (!stopping) {
    const g = await runScrape({ db, platform: '강남맛집', limit: 8000 }); // all 피드 전량(≈6.5천), 지역순회 불필요
    if ((g.newCandidates || 0) > (g.processed || 0)) more = true;
    console.log(`  [${ts()}] 수집(강남맛집): 방문형 ${g.newCandidates} · 처리 ${g.processed} · 적재 ${g.staged} · 중복 ${g.dupActive}`);
    const ga = await runAutopilot({ db });
    remaining = ga.remaining;
    console.log(`  [${ts()}] └ [강남맛집] AI검증: 자동등록 ${ga.registered} · 검수 ${ga.review} · 스킵 ${ga.skipped} · 남은대기 ${ga.remaining}`);
  }
  // 링블 (방문형 카테고리 832 목록 순회 → 상세 파싱, 전국 1회)
  if (!stopping) {
    const rb = await runScrape({ db, platform: '링블', limit: 400 });
    if ((rb.newCandidates || 0) > (rb.processed || 0)) more = true;
    console.log(`  [${ts()}] 수집(링블): 방문형 처리 ${rb.processed} · 적재 ${rb.staged} · 중복 ${rb.dupActive}`);
    const ra = await runAutopilot({ db });
    remaining = ra.remaining;
    console.log(`  [${ts()}] └ [링블] AI검증: 자동등록 ${ra.registered} · 검수 ${ra.review} · 스킵 ${ra.skipped} · 남은대기 ${ra.remaining}`);
  }
  // 포블로그 (V2 목록 전량 커서 수집 → 상세 파싱, 전국)
  if (!stopping) {
    const fb = await runScrape({ db, platform: '포블로그', limit: 120 });
    if ((fb.newCandidates || 0) > (fb.processed || 0)) more = true;
    console.log(`  [${ts()}] 수집(포블로그): 신규 ${fb.newCandidates} · 처리 ${fb.processed} · 적재 ${fb.staged} · 중복 ${fb.dupActive} · 제외 ${fb.excluded}`);
    const fa = await runAutopilot({ db });
    remaining = fa.remaining;
    console.log(`  [${ts()}] └ [포블로그] AI검증: 자동등록 ${fa.registered} · 검수 ${fa.review} · 스킵 ${fa.skipped} · 남은대기 ${fa.remaining}`);
  }
  return { collected, more, remaining };
}

(async () => {
  console.log(`크롤 워커 시작 — 지역: ${regions.join(', ')} · 최소대기 ${minWaitSec}s (Ctrl+C로 종료)`);
  if (!process.env.OPENAI_API_KEY) console.log('⚠️  OPENAI_API_KEY 없음 → 신규매장은 자동등록 대신 검수큐로 갑니다(.env.local에 추가 권장).');
  while (!stopping) {
    try {
      const r = await pass();
      if (stopping) break;
      // 아직 긁을 게 남았으면 짧게, 다 따라잡았으면 길게 대기(불필요한 요청 방지)
      const wait = (r.more || r.remaining > 0) ? minWaitSec : IDLE_WAIT_SEC;
      console.log(`  다음 패스까지 ${wait}s 대기…\n`);
      for (let i = 0; i < wait && !stopping; i++) await sleep(1000);
    } catch (e) {
      console.error(`  [${ts()}] 오류: ${e.message} — 30s 후 재시도`);
      for (let i = 0; i < 30 && !stopping; i++) await sleep(1000);
    }
  }
  console.log('워커 종료.');
  process.exit(0);
})();
