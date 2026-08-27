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

const { runScrape } = require('../api/_scrape');
const { runAutopilot } = require('../api/_autopilot');

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
    const s = await runScrape({ db, platform: 'dinnerqueen', mode: 'jeonche', limit: 250, region });
    collected += s.staged || 0;
    if ((s.newCandidates || 0) > (s.processed || 0)) more = true; // 아직 못 긁은 신규 남음
    console.log(`  [${ts()}] 수집(${region}): 신규 ${s.newCandidates} · 처리 ${s.processed} · 적재 ${s.staged} · 중복 ${s.dupActive}`);
    // ★ 각 지역 수집 직후 바로 AI 검증·등록 (4개 지역 다 끝날 때까지 안 기다림)
    const a = await runAutopilot({ db });
    remaining = a.remaining;
    console.log(`  [${ts()}] └ AI검증: 자동등록 ${a.registered} · 검수 ${a.review} · 스킵 ${a.skipped} · 남은대기 ${a.remaining}`);
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
