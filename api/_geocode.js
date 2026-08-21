/**
 * 서버 사이드 지오코딩 (오토파일럿용)
 *
 * - 공개 화면/어드민의 좌표변환은 브라우저 네이버 지도 JS SDK(naver.maps.Service.geocode)를 쓴다.
 *   크론(서버·무브라우저)에서는 그걸 못 쓰므로, 이미 보유한 네이버 로컬 검색 API 키를 재사용해
 *   매장명/주소로 검색 → 첫 결과의 mapx/mapy(WGS84*10^7)를 좌표로 사용한다.
 * - 새 api 파일 아님(_ 접두사 = Vercel 함수 카운트 제외). 새 키 불필요.
 *
 * ⚠️ 정확도 안전장치: 결과 좌표가 한국 범위 밖이면 null 반환 → 호출부(오토파일럿)가
 *    "지오코딩 실패"로 보고 사람 검수큐(🟡)로 보낸다. 오등록 방지 우선.
 */

// 대한민국 대략 경계(제주·도서 포함 여유). 이 밖이면 좌표 신뢰 안 함.
const KR_BOUNDS = { latMin: 33.0, latMax: 39.6, lngMin: 124.5, lngMax: 132.0 };

function inKorea(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= KR_BOUNDS.latMin && lat <= KR_BOUNDS.latMax
    && lng >= KR_BOUNDS.lngMin && lng <= KR_BOUNDS.lngMax;
}

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '');

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

// 로컬검색 mapx/mapy는 WGS84*10^7 정수 문자열(예: "1270276029" → 127.0276029).
function coordsFromItem(item) {
  const lng = Number(item.mapx) / 1e7;
  const lat = Number(item.mapy) / 1e7;
  if (!inKorea(lat, lng)) return null;
  return { lat, lng };
}

/**
 * 매장명/주소로 서버 지오코딩. 성공 시 {lat, lng, matchedName, matchedAddress}, 실패 시 null.
 * 시도 순서: (1) "매장명 주소" → (2) 매장명 단독 → (3) 주소 단독.
 * 주소 단독은 가게가 아닌 지번 중심점이 나올 수 있어 마지막 순위.
 */
async function geocodeServer({ name, address }) {
  const nm = String(name || '').trim();
  const addr = String(address || '').trim();
  const queries = [];
  if (nm && addr) queries.push(`${nm} ${addr}`);
  if (nm) queries.push(nm);
  if (addr) queries.push(addr);

  for (const q of queries) {
    let items = [];
    try { items = await naverLocal(q); } catch (e) { items = []; }
    for (const it of items) {
      const c = coordsFromItem(it);
      if (c) return { ...c, matchedName: stripTags(it.title), matchedAddress: it.roadAddress || it.address || '' };
    }
  }
  return null;
}

module.exports = { geocodeServer, inKorea };
