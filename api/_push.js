// 앱 푸시 발송(FCM HTTP v1) — 로컬 크롤러가 사용(_ 접두 = 서버리스 함수 카운트 제외).
// 서비스 계정 키(FIREBASE_SERVICE_ACCOUNT env, JSON 문자열)로 OAuth 토큰을 발급받아 FCM v1로 전송.
// 관심위치(push_prefs) 반경 안 기기에 매칭 발송. 설계: docs/product/16-push-notifications.md
const crypto = require('crypto');

let _svc = null;      // 파싱된 서비스 계정
let _token = null;    // { value, exp(ms) }

function serviceAccount() {
  if (_svc !== null) return _svc || null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!raw) { _svc = false; return null; }
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (j.private_key) j.private_key = String(j.private_key).replace(/\\n/g, '\n'); // env 단일행 대응
    _svc = j;
    return j;
  } catch (e) { _svc = false; return null; }
}

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// 서비스 계정으로 FCM용 OAuth 액세스 토큰 발급(약 1시간, 55분 캐시).
async function getAccessToken() {
  const sa = serviceAccount();
  if (!sa) return null;
  if (_token && Date.now() < _token.exp - 60000) return _token.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.private_key));
  const jwt = `${header}.${claim}.${sig}`;
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.access_token) return null;
  _token = { value: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) * 1000) };
  return _token.value;
}

// 토큰 배열에 동일 알림 발송. 반환 { sent, failed, invalid:[token…] }(무효 토큰은 호출측이 비활성화).
async function sendToTokens(tokens, { title, body, data }) {
  const sa = serviceAccount();
  const access = await getAccessToken();
  if (!sa || !access) return { sent: 0, failed: tokens.length, invalid: [] };
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const dataStr = {}; for (const k in (data || {})) dataStr[k] = String(data[k]); // FCM data는 문자열만
  let sent = 0, failed = 0; const invalid = [];
  for (const token of tokens) {
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title, body }, data: dataStr } }),
      });
      if (res.ok) { sent++; continue; }
      failed++;
      const err = await res.json().catch(() => ({}));
      const code = err && err.error && (err.error.status || err.error.message);
      // 등록 안 됨/무효 토큰 → 비활성화 대상
      if (res.status === 404 || res.status === 400 || /UNREGISTERED|INVALID_ARGUMENT/i.test(String(code))) invalid.push(token);
    } catch (e) { failed++; }
  }
  return { sent, failed, invalid };
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = (d) => d * Math.PI / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

async function disableInvalid(db, invalid) {
  if (!invalid || !invalid.length) return;
  const ph = invalid.map(() => '?').join(',');
  try { await db.execute({ sql: `UPDATE push_tokens SET enabled=0 WHERE token IN (${ph})`, args: invalid }); } catch (e) {}
}

// 하루 1회 요약 발송(스팸 방지). PUSH_DIGEST_HOUR(KST, 기본 12시) 이후 그날 아직 안 보냈으면,
// 각 기기의 관심위치 반경(+카테고리) 안에 '지난 24h 새로 뜬 활성 협찬 수'를 세어 1건으로 발송.
// 홍대처럼 협찬이 쏟아지는 동네도 하루 알림 1개("근처 새 협찬 N개")로 끝 → 알림 피로 없음.
async function notifyDailyDigest(db) {
  if (!serviceAccount()) return { devices: 0, reason: 'no-service-account' };
  const digestHour = Number(process.env.PUSH_DIGEST_HOUR || 12);
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const hourKst = nowKst.getUTCHours();                                   // KST로 시프트했으므로 UTC시 = KST시
  const todayInt = Number(nowKst.toISOString().slice(0, 10).replace(/-/g, '')); // YYYYMMDD
  if (hourKst < digestHour) return { devices: 0, reason: 'before-hour' };
  // 하루 1회 가드: scrape_state 'push_digest'.last_max_id = 마지막 발송 YYYYMMDD
  const st = (await db.execute("SELECT last_max_id FROM scrape_state WHERE platform='push_digest'")).rows[0];
  if (Number((st && st.last_max_id) || 0) >= todayInt) return { devices: 0, reason: 'already-sent' };

  const todayStr = nowKst.toISOString().slice(0, 10);
  const news = (await db.execute({
    sql: `SELECT p.lat AS lat, p.lng AS lng, p.category AS category
          FROM campaigns c JOIN places p ON p.id=c.place_id
          WHERE COALESCE(c.hidden,0)=0 AND COALESCE(p.hidden,0)=0
            AND (c.deadline='' OR c.deadline IS NULL OR c.deadline >= ?)
            AND c.created_at >= datetime('now','-1 day')
            AND p.lat IS NOT NULL AND p.lng IS NOT NULL`,
    args: [todayStr],
  })).rows;
  const prefs = (await db.execute("SELECT device_id, lat, lng, radius_km, categories FROM push_prefs WHERE enabled=1 AND lat IS NOT NULL AND lng IS NOT NULL")).rows;

  let devices = 0;
  for (const pf of prefs) {
    const radius = Number(pf.radius_km || 5);
    const cats = (pf.categories && String(pf.categories).trim()) ? String(pf.categories).split(',').map(s => s.trim()) : null;
    let n = 0;
    for (const c of news) {
      if (haversineKm(Number(pf.lat), Number(pf.lng), Number(c.lat), Number(c.lng)) > radius) continue;
      if (cats && c.category && !cats.includes(c.category)) continue;
      n++;
    }
    if (n <= 0) continue;
    const toks = (await db.execute({ sql: "SELECT token FROM push_tokens WHERE enabled=1 AND device_id=?", args: [pf.device_id] })).rows.map(r => r.token).filter(Boolean);
    if (!toks.length) continue;
    const r = await sendToTokens(toks, {
      title: '오늘의 새 협찬 🔔',
      body: `관심 지역 근처에 새 협찬 ${n}개가 올라왔어요`,
      data: { lat: String(pf.lat), lng: String(pf.lng) }, // 탭 시 그 위치로 지도 이동
    });
    await disableInvalid(db, r.invalid);
    if (r.sent > 0) devices++;
  }
  // 오늘 발송 완료 표시(0건이어도 오늘은 다시 안 돎)
  await db.execute({ sql: "INSERT OR REPLACE INTO scrape_state (platform, last_max_id, last_run_at) VALUES ('push_digest', ?, datetime('now'))", args: [todayInt] });
  return { devices, candidates: news.length };
}

module.exports = { getAccessToken, sendToTokens, notifyDailyDigest, serviceAccount };
