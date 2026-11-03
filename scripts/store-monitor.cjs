// 스토어 실적 + 전환 추이 일일 모니터링 (운영 DB 읽기전용 + 스토어 공개지표)
// 실행: node scripts/store-monitor.cjs   (TURSO_PROD_* 사용, 읽기 전용)
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const env = fs.readFileSync(path.join(REPO, '.env' + '.local'), 'utf8');
const g = (k) => { const m = env.match(new RegExp('^' + k + '\\s*=\\s*"?([^"\\n]+)"?', 'm')); return m ? m[1].trim() : ''; };
const { createClient } = require(path.join(REPO, 'node_modules/@libsql/client'));
const db = createClient({ url: g('TURSO_PROD_URL') || g('TURSO_DATABASE_URL'), authToken: g('TURSO_PROD_AUTH_TOKEN') || g('TURSO_AUTH_TOKEN') });
const rows = async (s) => (await db.execute(s)).rows;
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const IOS_ID = '6794363402', PKG = 'com.muhyeop.app';

async function storePublic() {
  const out = { ios: {}, play: {} };
  try {
    const j = await (await fetch(`https://itunes.apple.com/lookup?id=${IOS_ID}&country=kr`)).json();
    const r = (j.results || [])[0] || {};
    out.ios = { ver: r.version, rating: r.averageUserRatingForCurrentVersion ?? r.averageUserRating, reviews: r.userRatingCountForCurrentVersion ?? r.userRatingCount };
  } catch (e) { out.ios.err = e.message; }
  try {
    const html = await (await fetch(`https://play.google.com/store/apps/details?id=${PKG}&hl=ko&gl=KR`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const ver = (html.match(/\[\[\["(\d+\.\d+\.\d+)"\]\]/) || [])[1];
    const rating = (html.match(/(\d\.\d+)\s*star|"ratingValue"[^0-9]*(\d\.\d+)/) || []).filter(Boolean);
    out.play = { ver, rating: (html.match(/>(\d\.\d)<\/div><div[^>]*>(?:star)/) || html.match(/(\d\.\d)\s*★/) || [])[1] };
  } catch (e) { out.play.err = e.message; }
  return out;
}

(async () => {
  // 방문
  const daily = await rows(`SELECT visit_date, pv, uv FROM site_daily ORDER BY visit_date DESC LIMIT 8`);
  const t = daily.find(r => r.visit_date === today) || { pv: 0, uv: 0 };
  const uvTrue = (await rows(`SELECT COUNT(*) n FROM site_visitor WHERE visit_date='${today}'`))[0].n;
  const avg7 = (() => { const p = daily.filter(r => r.visit_date !== today).slice(0, 7); return p.length ? Math.round(p.reduce((s, r) => s + r.pv, 0) / p.length) : 0; })();
  // 가입
  const newM = (await rows(`SELECT COUNT(*) n FROM users WHERE date(created_at,'+9 hours')='${today}'`))[0].n;
  const totalM = (await rows(`SELECT COUNT(*) n FROM users`))[0].n;
  const newMBySrc = await rows(`SELECT COALESCE(NULLIF(signup_source,''),'(없음)') src, COUNT(*) n FROM users WHERE date(created_at,'+9 hours')='${today}' GROUP BY src ORDER BY n DESC`);
  // 7일 채널별 유입→가입 전환
  const vAll = await rows(`SELECT ref, SUM(cnt) v FROM site_referrer_daily WHERE visit_date>=date('${today}','-6 day') GROUP BY ref`);
  const sAll = await rows(`SELECT signup_source src, COUNT(*) n FROM users WHERE date(created_at,'+9 hours')>=date('${today}','-6 day') AND signup_source IS NOT NULL AND signup_source<>'' GROUP BY src`);
  const sm = {}; sAll.forEach(r => sm[r.src] = r.n);
  // 스토어 공개지표
  const store = await storePublic();

  // 스토어 다운로드 수(리포트 지연으로 어제 기준, 키·권한 있을 때만)
  let dl = { ios: null, play: null, date: null };
  try {
    const SD = require('./store-downloads.cjs');
    const yday = new Date(Date.now() + 9 * 3600e3 - 24 * 3600e3).toISOString().slice(0, 10);
    const [io, pl] = await Promise.all([
      SD.iosDownloads(yday).catch(e => ({ ok: false, reason: e.message })),
      SD.playInstalls(yday).catch(e => ({ ok: false, reason: e.message })),
    ]);
    dl = { ios: io, play: pl, date: yday };
  } catch (e) {}
  const dlStr = (r, key) => r && r.ok ? (r[key] ?? '—') : '미설정/대기';

  console.log(`==== 📊 무협맵 모니터링 ${today} ====`);
  console.log(`[다운로드 ${dl.date || '-'}] iOS ${dlStr(dl.ios, 'downloads')} / Play ${dlStr(dl.play, 'dailyInstalls')}`);
  console.log(`[방문] 오늘 PV ${t.pv} / UV ${uvTrue}  (7일평균 PV ${avg7})`);
  console.log(`[가입] 오늘 신규 ${newM}  / 누적 회원 ${totalM}  · 오늘경로: ${newMBySrc.map(r => r.src + ' ' + r.n).join(', ') || '-'}`);
  console.log(`[스토어] iOS v${store.ios.ver || '?'} ★${store.ios.rating ?? '?'}(${store.ios.reviews ?? '?'}) / Play v${store.play.ver || '?'} ★${store.play.rating || '?'}`);
  console.log(`[7일 채널 전환(유입핑→가입)]`);
  vAll.sort((a, b) => b.v - a.v).slice(0, 6).forEach(r => { const s = sm[r.ref] || 0; console.log(`   ${String(r.ref).padEnd(10)} 유입 ${String(r.v).padStart(4)}  가입 ${String(s).padStart(2)}  ${r.v ? '(' + (s / r.v * 100).toFixed(1) + '%)' : ''}`); });
  console.log(`[최근 8일 PV/UV]`);
  daily.forEach(r => console.log(`   ${r.visit_date}  PV ${String(r.pv).padStart(4)}  UV ${String(r.uv).padStart(4)}`));

  // 일별 메트릭 JSONL 적재(세션과 무관한 영구 로그, 날짜별 upsert)
  try {
    const kak = vAll.find(r => r.ref === 'kakao') || { v: 0 };
    const appSignupToday = (newMBySrc.find(r => r.src === 'app') || { n: 0 }).n;
    const row = {
      date: today, pv: t.pv, uv: uvTrue, newMembers: newM, totalMembers: totalM,
      appSignupToday, kakaoV7: kak.v, kakaoS7: (sm['kakao'] || 0),
      iosVer: store.ios.ver, iosRating: store.ios.rating, iosReviews: store.ios.reviews,
      playVer: store.play.ver,
      dlDate: dl.date, iosDL: dl.ios && dl.ios.ok ? dl.ios.downloads : null, playInstalls: dl.play && dl.play.ok ? dl.play.dailyInstalls : null,
      ts: new Date().toISOString(),
    };
    const dir = path.join(REPO, 'output'); try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    const f = path.join(dir, 'store-metrics.jsonl');
    let lines = [];
    try { lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).filter(l => { try { return JSON.parse(l).date !== today; } catch (_) { return false; } }); } catch (e) {}
    lines.push(JSON.stringify(row));
    fs.writeFileSync(f, lines.join('\n') + '\n');
    console.log(`[로그] ${f} (${lines.length}일치)`);
  } catch (e) { console.log('[로그] 적재 실패: ' + e.message); }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
