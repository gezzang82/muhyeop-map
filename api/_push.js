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

// 새 협찬(매장 좌표·카테고리)에 대해 관심위치 매칭 기기로 발송.
// campaign: { placeId, lat, lng, category, placeName }
async function notifyNewCampaign(db, campaign) {
  if (!serviceAccount()) return { matched: 0, sent: 0 };
  if (campaign.lat == null || campaign.lng == null) return { matched: 0, sent: 0 };
  const prefs = (await db.execute("SELECT device_id, lat, lng, radius_km, categories FROM push_prefs WHERE enabled=1 AND lat IS NOT NULL AND lng IS NOT NULL")).rows;
  const targetDevices = [];
  for (const p of prefs) {
    const dist = haversineKm(Number(p.lat), Number(p.lng), Number(campaign.lat), Number(campaign.lng));
    if (dist > Number(p.radius_km || 5)) continue;
    if (p.categories && String(p.categories).trim()) {
      const cats = String(p.categories).split(',').map(s => s.trim());
      if (campaign.category && !cats.includes(campaign.category)) continue;
    }
    targetDevices.push(p.device_id);
  }
  if (!targetDevices.length) return { matched: 0, sent: 0 };
  // 기기의 활성 토큰 조회
  const ph = targetDevices.map(() => '?').join(',');
  const toks = (await db.execute({ sql: `SELECT token FROM push_tokens WHERE enabled=1 AND device_id IN (${ph})`, args: targetDevices })).rows.map(r => r.token).filter(Boolean);
  if (!toks.length) return { matched: targetDevices.length, sent: 0 };
  const title = '내 동네 새 협찬 🔔';
  const body = campaign.placeName ? `${campaign.placeName} 협찬이 떴어요` : '관심 지역에 새 협찬이 등록됐어요';
  const r = await sendToTokens(toks, { title, body, data: { placeId: String(campaign.placeId || '') } });
  if (r.invalid.length) {
    const iph = r.invalid.map(() => '?').join(',');
    try { await db.execute({ sql: `UPDATE push_tokens SET enabled=0 WHERE token IN (${iph})`, args: r.invalid }); } catch (e) {}
  }
  return { matched: targetDevices.length, sent: r.sent };
}

module.exports = { getAccessToken, sendToTokens, notifyNewCampaign, serviceAccount };
