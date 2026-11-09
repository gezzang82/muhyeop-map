// 스토어 다운로드 수 조회 (iOS App Store Connect Sales Reports + Google Play GCS 통계 export)
// 추가 npm 의존성 없음 — Node 내장 crypto/zlib + fetch(Node18+).
// 필요한 .env.local 키(사용자가 각 콘솔에서 발급해 붙여넣어야 함):
//   [iOS] ASC_KEY_ID, ASC_ISSUER_ID, ASC_VENDOR_NUMBER, ASC_KEY_P8(= -----BEGIN PRIVATE KEY----- ... 멀티라인)
//   [Play] GOOGLE_PLAY_SA_JSON(서비스계정 JSON 한 줄), GPLAY_STATS_BUCKET(예: pubsite_prod_rev_1234567890)
// 실행: node scripts/store-downloads.cjs [YYYY-MM-DD]   (날짜 생략=어제, 리포트는 하루 지연)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const REPO = path.resolve(__dirname, '..');
const envTxt = fs.readFileSync(path.join(REPO, '.env' + '.local'), 'utf8');
// 멀티라인 값(P8/JSON) 지원: KEY="..." 또는 KEY=... 한 줄, 그리고 KEY=`<<다음 BEGIN까지>>` 형태 모두 관대 파싱
function envGet(k) {
  // 따옴표로 감싼 멀티라인 우선
  let m = envTxt.match(new RegExp('^' + k + '\\s*=\\s*"([\\s\\S]*?)"\\s*$', 'm'));
  if (m) return m[1];
  m = envTxt.match(new RegExp("^" + k + "\\s*=\\s*'([\\s\\S]*?)'\\s*$", 'm'));
  if (m) return m[1];
  m = envTxt.match(new RegExp('^' + k + '\\s*=\\s*(.+)$', 'm'));
  return m ? m[1].trim() : '';
}
const PKG = 'com.muhyeop.app';
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const yyyymmdd = (d) => d.toISOString().slice(0, 10);
const argDate = process.argv[2];
const reportDate = argDate || yyyymmdd(new Date(Date.now() - 24 * 3600e3)); // 기본 어제(리포트 지연)

// ---------- iOS: App Store Connect Sales Reports ----------
async function iosDownloads(date) {
  const KEY_ID = envGet('ASC_KEY_ID'), ISSUER = envGet('ASC_ISSUER_ID'), VENDOR = envGet('ASC_VENDOR_NUMBER');
  const p8File = envGet('ASC_KEY_P8_FILE'); // 권장: 다운로드한 .p8 파일 경로
  let P8 = '';
  if (p8File) { try { P8 = fs.readFileSync(p8File.replace(/^~/, process.env.HOME), 'utf8'); } catch (e) { return { ok: false, reason: 'ASC_KEY_P8_FILE 읽기 실패: ' + e.message }; } }
  else { P8 = envGet('ASC_KEY_P8').replace(/\\n/g, '\n'); }
  if (!KEY_ID || !ISSUER || !VENDOR || !P8) return { ok: false, reason: 'iOS 키 미설정(ASC_KEY_ID/ISSUER_ID/VENDOR_NUMBER + P8_FILE 또는 KEY_P8)' };
  // JWT(ES256)
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ISSUER, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const keyObj = crypto.createPrivateKey(P8);
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: keyObj, dsaEncoding: 'ieee-p1363' });
  const jwt = signingInput + '.' + b64url(sig);
  const url = `https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportDate]=${date}&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${VENDOR}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + jwt, Accept: 'application/a-gzip' } });
  if (res.status === 404) return { ok: true, date, downloads: 0, note: '해당일 리포트 없음(아직 미생성/판매 0)' };
  if (!res.ok) return { ok: false, reason: `iOS API ${res.status}: ${(await res.text()).slice(0, 160)}` };
  const buf = Buffer.from(await res.arrayBuffer());
  const tsv = zlib.gunzipSync(buf).toString('utf8');
  const lines = tsv.split('\n').filter(Boolean);
  const head = lines[0].split('\t');
  const iPT = head.indexOf('Product Type Identifier'), iU = head.indexOf('Units'), iSKU = head.indexOf('SKU'), iName = head.indexOf('Title');
  let dl = 0, updates = 0; const breakdown = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split('\t');
    const pt = c[iPT], u = parseInt(c[iU], 10) || 0;
    breakdown[pt] = (breakdown[pt] || 0) + u;
    // 첫 다운로드(무료앱) product types: 1, 1F, 1T, F1 / 업데이트: 7,7F 등 / 재다운로드: 3
    if (['1', '1F', '1T', 'F1', '1E', '1EP', '1EU'].includes(pt)) dl += u;
    else if (['7', '7F', '7T', 'F7'].includes(pt)) updates += u;
  }
  return { ok: true, date, downloads: dl, updates, breakdown };
}

// ---------- Play: 서비스계정 → GCS 통계 export(installs overview CSV) ----------
async function playInstalls(date) {
  const BUCKET = envGet('GPLAY_STATS_BUCKET');
  const saFile = envGet('GOOGLE_PLAY_SA_FILE'); // 권장: 다운로드한 JSON 파일 경로
  let saRaw = '';
  if (saFile) { try { saRaw = fs.readFileSync(saFile.replace(/^~/, process.env.HOME), 'utf8'); } catch (e) { return { ok: false, reason: 'GOOGLE_PLAY_SA_FILE 읽기 실패: ' + e.message }; } }
  else { saRaw = envGet('GOOGLE_PLAY_SA_JSON'); }
  if (!saRaw || !BUCKET) return { ok: false, reason: 'Play 키 미설정(GOOGLE_PLAY_SA_FILE 또는 GOOGLE_PLAY_SA_JSON / GPLAY_STATS_BUCKET)' };
  let sa; try { sa = JSON.parse(saRaw); } catch (e) { return { ok: false, reason: 'SA JSON 파싱 실패(파일 경로 방식 권장): ' + e.message }; }
  // SA JWT(RS256) → OAuth 토큰
  const now = Math.floor(Date.now() / 1000);
  const jh = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const jp = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_only', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const jsig = b64url(crypto.sign('RSA-SHA256', Buffer.from(jh + '.' + jp), sa.private_key));
  const assertion = jh + '.' + jp + '.' + jsig;
  const tk = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })).json();
  if (!tk.access_token) return { ok: false, reason: 'Play OAuth 실패: ' + JSON.stringify(tk).slice(0, 160) };
  const ym = date.slice(0, 7).replace('-', ''); // YYYYMM
  const obj = encodeURIComponent(`stats/installs/installs_${PKG}_${ym}_overview.csv`);
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${obj}?alt=media`, { headers: { Authorization: 'Bearer ' + tk.access_token } });
  if (res.status === 404) return { ok: true, date, note: `해당월 통계파일 없음(월 ${ym} 아직 미생성)` };
  if (!res.ok) return { ok: false, reason: `Play GCS ${res.status}: ${(await res.text()).slice(0, 160)}` };
  // Google 통계 CSV는 UTF-16LE
  const buf = Buffer.from(await res.arrayBuffer());
  const csv = buf.toString('utf16le').replace(/^﻿/, '');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  const iDate = head.findIndex(h => /^Date/i.test(h));
  const iInst = head.findIndex(h => /Daily (Device|User) Installs/i.test(h));
  const iActive = head.findIndex(h => /Active Device Installs|Total User Installs/i.test(h));
  let dayInstalls = null, active = null;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c[iDate] === date) { dayInstalls = parseInt(c[iInst], 10); if (iActive >= 0) active = parseInt(c[iActive], 10); }
  }
  return { ok: true, date, dailyInstalls: dayInstalls, activeInstalls: active, columns: head };
}

// ---------- Play 누적 다운로드 + 활성 ----------
//  Play Console '총 설치 수'(누적) = Daily User Installs 합(출시월~date). ('Total User Installs' 컬럼은 이 export에서 전부 0이라 못 씀 → iOS처럼 일별 합산)
//  '활성 기기 수' = Active Device Installs 최신행. 둘 다 반환 {date, total(누적), active(활성)}.
async function playTotal(date) {
  const BUCKET = envGet('GPLAY_STATS_BUCKET');
  const saFile = envGet('GOOGLE_PLAY_SA_FILE');
  let saRaw = saFile ? fs.readFileSync(saFile.replace(/^~/, process.env.HOME), 'utf8') : envGet('GOOGLE_PLAY_SA_JSON');
  if (!saRaw || !BUCKET) return null;
  let sa; try { sa = JSON.parse(saRaw); } catch (e) { return null; }
  const now = Math.floor(Date.now() / 1000);
  const jh = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const jp = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_only', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const jsig = b64url(crypto.sign('RSA-SHA256', Buffer.from(jh + '.' + jp), sa.private_key));
  const tk = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jh + '.' + jp + '.' + jsig }) })).json();
  if (!tk.access_token) return null;
  // 출시월(2026-10, Play 리포트 시작)부터 date월까지 월 CSV 순회
  const months = [];
  { let y = 2026, m = 10; const endYm = Number(date.slice(0, 4)) * 100 + Number(date.slice(5, 7)); while (y * 100 + m <= endYm) { months.push(String(y) + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } }
  let cum = 0, active = null, asOf = null;
  for (const ym of months) {
    const obj = encodeURIComponent(`stats/installs/installs_${PKG}_${ym}_overview.csv`);
    const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${obj}?alt=media`, { headers: { Authorization: 'Bearer ' + tk.access_token } });
    if (!res.ok) continue;
    const csv = Buffer.from(await res.arrayBuffer()).toString('utf16le').replace(/^﻿/, '');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(',');
    const iDate = head.findIndex(h => /^Date/i.test(h));
    const iDU = head.findIndex(h => /Daily User Installs/i.test(h));
    const iAD = head.findIndex(h => /Active Device Installs/i.test(h));
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c[iDate] > date) continue;              // date 이후는 제외
      const du = parseInt(c[iDU], 10); if (!isNaN(du)) cum += du;         // 누적 신규(일별 설치 합)
      const ad = parseInt(c[iAD], 10); if (!isNaN(ad)) { active = ad; asOf = c[iDate]; }  // 활성(최신행)
    }
  }
  if (asOf == null) return null;
  return { date: asOf, total: cum, active };
}

// ---------- 앱 누적 다운로드 토탈 (대시보드용) ----------
//  iOS = 일별 '첫 다운로드' 합(출시~어제). Play = Total User Installs 최신행. 각 플랫폼 기준일(asOf) 함께 반환.
async function appTotals(opts = {}) {
  const startIos = opts.startIos || '2026-10-15'; // 출시(~10월말) 이전은 리포트 없음→0, 안전하게 10/15부터
  const endExclusive = new Date(Date.now()); // 오늘(어제 리포트까지 자연히 0/미생성)
  let iosTotal = 0, iosAsOf = null, iosUpdates = 0;
  for (let d = new Date(startIos + 'T00:00:00Z'); d < endExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = d.toISOString().slice(0, 10);
    let r; try { r = await iosDownloads(ds); } catch (e) { continue; }
    if (r && r.ok && typeof r.downloads === 'number') { iosTotal += r.downloads; iosUpdates += (r.updates || 0); if (r.downloads > 0) iosAsOf = ds; }
  }
  // Play: 최근 10일 중 데이터 있는 최신(누적 total + 활성 active)
  let play = null;
  for (let i = 1; i <= 10 && !play; i++) { const ds = yyyymmdd(new Date(Date.now() - i * 864e5)); try { play = await playTotal(ds); } catch (e) {} }
  return { iosTotal, iosAsOf, iosUpdates, playTotal: play ? play.total : null, playActive: play ? play.active : null, playAsOf: play ? play.date : null };
}

module.exports = { iosDownloads, playInstalls, playTotal, appTotals };

if (process.argv[2] === 'totals') {
  (async () => {
    const t = await appTotals();
    console.log('TOTALS ' + JSON.stringify(t));
    // 운영 DB에 스냅샷 저장(대시보드용). TURSO_PROD_* 있으면.
    const PURL = envGet('TURSO_PROD_URL'), PTOK = envGet('TURSO_PROD_AUTH_TOKEN');
    if (PURL && PTOK) {
      try {
        const { createClient } = require('@libsql/client');
        const db = createClient({ url: PURL, authToken: PTOK });
        await db.execute("CREATE TABLE IF NOT EXISTS app_downloads (platform TEXT PRIMARY KEY, total INTEGER, as_of TEXT, updated_at TEXT)");
        try { await db.execute("ALTER TABLE app_downloads ADD COLUMN active INTEGER"); } catch (e) {}  // Play 활성 기기 수(iOS는 null)
        const now = new Date().toISOString();
        const rows = [['ios', t.iosTotal, t.iosAsOf, null], ['play', t.playTotal, t.playAsOf, t.playActive]];
        for (const [p, tot, asof, act] of rows) {
          if (tot == null) continue; // 값 없으면 기존 유지(덮어쓰지 않음)
          await db.execute({ sql: "INSERT INTO app_downloads(platform,total,as_of,active,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(platform) DO UPDATE SET total=excluded.total, as_of=excluded.as_of, active=excluded.active, updated_at=excluded.updated_at", args: [p, tot, asof || '', act, now] });
        }
        console.log('SAVED app_downloads (ios/play)');
      } catch (e) { console.log('DB save 실패:', e.message); }
    }
  })();
}
if (process.argv[2] === 'playdump') {
  (async () => {
    const BUCKET = envGet('GPLAY_STATS_BUCKET');
    const saFile = envGet('GOOGLE_PLAY_SA_FILE');
    const sa = JSON.parse(saFile ? fs.readFileSync(saFile.replace(/^~/, process.env.HOME), 'utf8') : envGet('GOOGLE_PLAY_SA_JSON'));
    const now = Math.floor(Date.now() / 1000);
    const jh = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), jp = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/devstorage.read_only', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const jsig = b64url(crypto.sign('RSA-SHA256', Buffer.from(jh + '.' + jp), sa.private_key));
    const tk = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jh + '.' + jp + '.' + jsig }) })).json();
    for (const ym of ['202610', '202611']) {
      const obj = encodeURIComponent(`stats/installs/installs_${PKG}_${ym}_overview.csv`);
      const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${obj}?alt=media`, { headers: { Authorization: 'Bearer ' + tk.access_token } });
      console.log('=== ' + ym + ' http:' + res.status + ' ===');
      if (!res.ok) continue;
      const csv = Buffer.from(await res.arrayBuffer()).toString('utf16le').replace(/^﻿/, '');
      const lines = csv.split(/\r?\n/).filter(Boolean);
      console.log('COLS:', lines[0]);
      lines.slice(1).forEach(l => console.log(l));
    }
  })();
}

if (require.main === module && !['totals', 'playdump'].includes(process.argv[2])) {
  (async () => {
    console.log(`==== 스토어 다운로드 (${reportDate}) ====`);
    for (const [label, fn] of [['iOS', iosDownloads], ['Play', playInstalls]]) {
      try { const r = await fn(reportDate); console.log(label + ': ' + JSON.stringify(r)); }
      catch (e) { console.log(label + ': ERR ' + e.message); }
    }
  })();
}
