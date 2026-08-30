/**
 * 서버 사이드 지오코딩 (오토파일럿/승인 스크립트용)
 *
 * 우선순위:
 *   1) 네이버 NCP Geocoding API로 **주소 → 좌표** (정확·건물단위). 주소가 있으면 이걸 우선.
 *      (NAVER_MAPS_KEY_ID / NAVER_MAPS_KEY 필요. 지도 스크립트 ncpKeyId와 같은 NCP 계정.)
 *   2) 폴백: 네이버 로컬검색(POI, 이름 기반). 프랜차이즈 다른 지점 오매칭 방지 위해
 *      **주소가 있으면 결과의 시/도·시군구가 일치하는 것만 채택**(지역 불일치는 버림).
 *
 * ⚠️ 결과 좌표가 한국 범위 밖이면 null → 호출부(오토파일럿)가 "지오코딩 실패"로 검수큐(🟡)로 보냄.
 *
 * (구: 이름 기반 로컬검색만 사용 → "데몬프리다이빙 광주"가 남원 지점을 잡는 등 오좌표. 주소 우선으로 개선.)
 */

const KR_BOUNDS = { latMin: 33.0, latMax: 39.6, lngMin: 124.5, lngMax: 132.0 };

function inKorea(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= KR_BOUNDS.latMin && lat <= KR_BOUNDS.latMax
    && lng >= KR_BOUNDS.lngMin && lng <= KR_BOUNDS.lngMax;
}

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '');

// ---- 지역(시/도·시군구) 정규화: 폴백 결과 검증용 ----
function canonSido(a) {
  a = String(a || '').replace(/\s/g, '');
  const t = [['서울', /^서울/], ['부산', /^부산/], ['대구', /^대구/], ['인천', /^인천/], ['광주', /광주/], ['대전', /^대전/], ['울산', /^울산/], ['세종', /^세종/], ['경기', /^경기/], ['강원', /^강원/], ['충북', /^(충청북|충북)/], ['충남', /^(충청남|충남)/], ['전북', /^(전라북|전북)/], ['전남', /^(전라남|전남)/], ['경북', /^(경상북|경북)/], ['경남', /^(경상남|경남)/], ['제주', /제주/]];
  for (const [k, re] of t) if (re.test(a)) return k;
  return '';
}
function sigungu(a) {
  const gugun = String(a).match(/([가-힣]{1,6}(?:구|군))(?![가-힣])/g) || [];
  if (gugun.length) return gugun[gugun.length - 1];
  return (String(a).match(/([가-힣]{1,6}시)(?![가-힣])/) || [])[1] || '';
}
// 후보 주소가 목표 주소와 같은 지역인가: 시/도 일치 + (시군구 일치 or 시군구 미상)
function regionMatch(target, cand) {
  const ts = canonSido(target), cs = canonSido(cand);
  if (!ts || ts !== cs) return false; // 시/도부터 다르면 다른 지점
  const tg = sigungu(target), cg = sigungu(cand);
  if (tg && cg && tg !== cg) return false; // 시군구 둘 다 있는데 다르면 다른 지점
  return true;
}

// ---- 1) NCP Geocoding: 주소 → 좌표 ----
async function ncpGeocode(address) {
  if (!process.env.NAVER_MAPS_KEY_ID || !process.env.NAVER_MAPS_KEY) return null;
  try {
    const url = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=' + encodeURIComponent(address);
    const res = await fetch(url, {
      headers: {
        'x-ncp-apigw-api-key-id': process.env.NAVER_MAPS_KEY_ID,
        'x-ncp-apigw-api-key': process.env.NAVER_MAPS_KEY,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = (data.addresses || [])[0];
    if (!a) return null;
    const lat = Number(a.y), lng = Number(a.x);
    if (!inKorea(lat, lng)) return null;
    return { lat, lng, matchedName: '', matchedAddress: a.roadAddress || a.jibunAddress || '' };
  } catch (e) { return null; }
}

// ---- 2) 폴백: 로컬검색(POI, 이름 기반) ----
async function naverLocal(query) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_SEARCH_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_SEARCH_CLIENT_SECRET,
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}
function coordsFromItem(item) {
  const lng = Number(item.mapx) / 1e7;
  const lat = Number(item.mapy) / 1e7;
  if (!inKorea(lat, lng)) return null;
  return { lat, lng };
}

/**
 * 매장명/주소로 서버 지오코딩. 성공 시 {lat, lng, matchedName, matchedAddress}, 실패 시 null.
 */
async function geocodeServer({ name, address }) {
  const nm = String(name || '').trim();
  const addr = String(address || '').trim();

  // 1) 주소 기반 NCP 지오코딩(정확). 주소가 있으면 우선.
  if (addr) {
    const g = await ncpGeocode(addr);
    if (g) return g;
  }

  // 2) 폴백: 이름 기반 로컬검색. 주소가 있으면 지역 일치하는 결과만 채택(오지점 방지).
  const queries = [];
  if (nm && addr) queries.push(`${nm} ${addr}`);
  if (nm) queries.push(nm);
  if (addr) queries.push(addr);
  for (const q of queries) {
    let items = [];
    try { items = await naverLocal(q); } catch (e) { items = []; }
    for (const it of items) {
      const c = coordsFromItem(it);
      if (!c) continue;
      const ca = it.roadAddress || it.address || '';
      if (addr && !regionMatch(addr, ca)) continue; // 지역 불일치 → 다른 지점, 버림
      return { ...c, matchedName: stripTags(it.title), matchedAddress: ca };
    }
  }
  return null;
}

module.exports = { geocodeServer, inKorea, ncpGeocode };
