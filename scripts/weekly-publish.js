// 주간 데이터 리포트 '스레드 자동 발행' — 집계 → 스레드 텍스트 자동 게시. 크론/수동 모두 가능.
//   실행: node scripts/weekly-publish.js          (실제 발행)
//        node scripts/weekly-publish.js --dry     (미리보기만, 발행 안 함)
//   인스타는 이미지(카드)가 필요해 반자동: 이 스크립트가 캡션/수치를 출력하고, 카드 렌더+발행은 별도.
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const report = require('./weekly-data-report.js');
const env = fs.readFileSync(path.join(REPO, '.env.local'), 'utf8');
const g = (k) => { const m = env.match(new RegExp('^' + k + '\\s*=\\s*"?([^"\\n]+)"?', 'm')); return m ? m[1].trim() : ''; };
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');
const TH_TOKEN = g('THREADS_ACCESS_TOKEN');
// 주간 중복방지 마커(로컬 파일) — 같은 ISO주에 한 번만 발행. 저녁에 Mac 켤 때마다 cron이 체크해도 1회만.
const MARKER = path.join(REPO, 'output', '.weekly-last-week');
function isoWeekKST() {
  const dt = new Date(Date.now() + 9 * 3600e3);
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((d - ys) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}
const TH_UID = '28091621880512563';
const TH = 'https://graph.threads.net/v1.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function postThreads(text) {
  let j = await (await fetch(`${TH}/${TH_UID}/threads`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ media_type: 'TEXT', text, access_token: TH_TOKEN }) })).json();
  if (!j.id) throw new Error('컨테이너 실패: ' + JSON.stringify(j.error || j).slice(0, 200));
  const cid = j.id; await sleep(1500);
  j = await (await fetch(`${TH}/${TH_UID}/threads_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: cid, access_token: TH_TOKEN }) })).json();
  if (!j.id) throw new Error('발행 실패: ' + JSON.stringify(j.error || j).slice(0, 200));
  let permalink = ''; try { const p = await (await fetch(`${TH}/${j.id}?fields=permalink&access_token=${encodeURIComponent(TH_TOKEN)}`)).json(); permalink = p.permalink || ''; } catch (_) {}
  return permalink || j.id;
}

(async () => {
  const d = await report.aggregate();
  const x = report.derive(d);
  const threadsText = report.genThreads(d, x);
  console.log('===== 스레드 발행 내용 =====\n' + threadsText + '\n');

  if (DRY) { console.log('[--dry] 발행 안 함(미리보기).'); process.exit(0); }

  // 주간 가드: 이번 ISO주에 이미 발행했으면 스킵(저녁마다 cron이 돌아도 1회만). --force로 무시.
  const week = isoWeekKST();
  let last = ''; try { last = fs.readFileSync(MARKER, 'utf8').trim(); } catch (e) {}
  if (last === week && !FORCE) { console.log(`이번 주(${week}) 이미 발행됨 — 스킵.`); process.exit(0); }

  if (!TH_TOKEN) throw new Error('THREADS_ACCESS_TOKEN 없음');
  console.log(`[${new Date().toISOString()}] 스레드 발행 중… (주 ${week})`);
  const link = await postThreads(threadsText);
  console.log('✅ 스레드 발행 완료:', link);
  try { fs.mkdirSync(path.dirname(MARKER), { recursive: true }); fs.writeFileSync(MARKER, week); } catch (e) {}

  // 인스타는 카드 이미지 필요 → 캡션/수치만 안내(반자동)
  console.log('\n===== 인스타(반자동) — 카드 렌더 후 발행 필요 =====');
  console.log(`핵심수치: 활성 ${report.fmt(d.total)}건 / 매장 ${report.fmt(d.places)}곳 / 수도권 ${x.capitalPct}% / ${x.topCat.k} ${x.topCatPct}% / 3강 ${x.top3Pct}%`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
