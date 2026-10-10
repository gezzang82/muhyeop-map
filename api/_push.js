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

// 가중 랜덤 선택: weightMap 비중대로 하나 고름(후보 있는 항목만 넘어옴).
function weightedPick(items, weightMap) {
  const total = items.reduce((s, it) => s + (weightMap[it] || 1), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= (weightMap[it] || 1); if (r < 0) return it; }
  return items[items.length - 1];
}

// 하루 1회 발송(스팸 방지). PUSH_DIGEST_HOUR(KST, 기본 12시) 이후 그날 아직 안 보냈으면,
// 각 기기의 관심위치 반경 안 '지난 24h 신규 활성 협찬' 중 카테고리 가중 랜덤(음식점>뷰티>카페)으로
// 캠페인 1개를 콕 집어 발송(재방문 유도). 셋 다 없으면 그 기기는 스킵. 탭 시 그 매장 상세로 이동(placeId).
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
  const CAT_WEIGHT = { '음식점': 5, '뷰티': 3, '카페': 2 }; // 비중 가중(그 외 카테고리는 기본 1)
  // 지난 24h 신규 활성 협찬(전 카테고리) — 매장명/제공내용/좌표/카테고리 조인
  const cands = (await db.execute({
    sql: `SELECT c.id AS id, c.place_id AS placeId, c.content AS content,
                 p.name AS name, p.lat AS lat, p.lng AS lng, p.category AS category
          FROM campaigns c JOIN places p ON p.id=c.place_id
          WHERE COALESCE(c.hidden,0)=0 AND COALESCE(p.hidden,0)=0
            AND (c.deadline='' OR c.deadline IS NULL OR c.deadline >= ?)
            AND c.created_at >= datetime('now','-1 day')
            AND p.lat IS NOT NULL AND p.lng IS NOT NULL`,
    args: [todayStr],
  })).rows;
  if (!cands.length) {
    await db.execute({ sql: "INSERT OR REPLACE INTO scrape_state (platform, last_max_id, last_run_at) VALUES ('push_digest', ?, datetime('now'))", args: [todayInt] });
    return { devices: 0, candidates: 0 };
  }

  // 마스터 토글 컬럼 보장(기본 ON)
  try { await db.execute("ALTER TABLE users ADD COLUMN push_digest_enabled INTEGER DEFAULT 1"); } catch (e) {}
  // 발송 대상 = 내 장소 알림 ON(user_places.alarm_enabled) + 마스터 ON(users.push_digest_enabled) 유저의 관심지점들
  const places = (await db.execute(`
    SELECT up.user_id AS userId, up.lat AS lat, up.lng AS lng, up.radius_km AS radiusKm, up.categories AS categories
    FROM user_places up JOIN users u ON u.id = up.user_id
    WHERE up.alarm_enabled=1 AND up.lat IS NOT NULL AND up.lng IS NOT NULL
      AND COALESCE(u.push_digest_enabled,1)=1`)).rows;
  // 유저별로 관심지점 묶기(한 유저가 집/회사/여행지 여러 곳)
  const byUser = new Map();
  for (const pl of places) {
    const arr = byUser.get(pl.userId) || [];
    arr.push(pl);
    byUser.set(pl.userId, arr);
  }

  let devices = 0, usersTargeted = 0;
  for (const [userId, userPlaces] of byUser) {
    // 이 유저의 모든 관심지점(각자 반경·카테고리) 안에 드는 신규 협찬을 모아 캠페인 id로 중복 제거
    const matched = new Map(); // campaignId -> cand
    for (const c of cands) {
      for (const pl of userPlaces) {
        // user_places.categories는 JSON 배열(["음식점","카페"]) — JSON.parse. (혹시 콤마형이면 폴백)
        let cats = null;
        try { const pc = pl.categories ? JSON.parse(pl.categories) : null; if (Array.isArray(pc) && pc.length) cats = pc; }
        catch (e) { if (pl.categories && String(pl.categories).trim()) cats = String(pl.categories).split(',').map(s => s.trim()).filter(Boolean); }
        if (cats && cats.length && !cats.includes(c.category)) continue; // 장소별 카테고리 필터(빈값=전체)
        if (haversineKm(Number(pl.lat), Number(pl.lng), Number(c.lat), Number(c.lng)) > Number(pl.radiusKm || 3)) continue;
        matched.set(c.id, c); break; // 한 지점이라도 들면 채택
      }
    }
    if (!matched.size) continue;
    // 카테고리 가중 랜덤 → 그 카테고리 중 1건 랜덤(유저당 1건)
    const pool = [...matched.values()];
    const avail = [...new Set(pool.map(c => c.category))];
    const cat = weightedPick(avail, CAT_WEIGHT);
    const inCat = pool.filter(c => c.category === cat);
    const pick = inCat[Math.floor(Math.random() * inCat.length)];
    const toks = (await db.execute({ sql: "SELECT token FROM push_tokens WHERE enabled=1 AND user_id=?", args: [userId] })).rows.map(r => r.token).filter(Boolean);
    if (!toks.length) continue; // 알림은 켰지만 앱 토큰 미등록(웹만 쓰는 유저 등)
    usersTargeted++;
    // 매장명을 title에 올려 OS가 볼드로 렌더(본문은 서식 불가). 본문엔 훅+제공내용.
    const desc = String(pick.content || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    const r = await sendToTokens(toks, {
      title: `🔔 ${pick.name}`,
      body: desc ? `내 장소 주변 새 협찬 · ${desc}` : '내 장소 주변에 새 협찬이 떴어요',
      data: { placeId: String(pick.placeId), lat: String(pick.lat), lng: String(pick.lng), kind: 'digest' }, // 탭 → 매장 상세(+탭 집계용 kind)
    });
    await disableInvalid(db, r.invalid);
    if (r.sent > 0) devices++;
  }
  // 오늘 발송 완료 표시(0건이어도 오늘은 다시 안 돎)
  await db.execute({ sql: "INSERT OR REPLACE INTO scrape_state (platform, last_max_id, last_run_at) VALUES ('push_digest', ?, datetime('now'))", args: [todayInt] });
  return { devices, usersTargeted, candidates: cands.length };
}

module.exports = { getAccessToken, sendToTokens, notifyDailyDigest, serviceAccount };
