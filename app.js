// ===== 무협맵 app.js =====

// 데이터 구조: 장소(Places) + 캠페인(Campaigns)
// 실제 데이터는 loadInitialData()가 /api/places, /api/campaigns에서 받아와 채운다.
let places = [];
let campaigns = [];
let banners = [];

let _dataLoadPromise = null;
function loadInitialData() {
  if (!_dataLoadPromise) {
    _dataLoadPromise = (async () => {
      const [placesRes, campaignsRes, bannersRes] = await Promise.all([
        fetch('/api/places'),
        fetch('/api/campaigns'),
        fetch('/api/banners')
      ]);
      places = await placesRes.json();
      campaigns = await campaignsRes.json();
      banners = await bannersRes.json();
      invalidateActiveCache();
    })();
  }
  return _dataLoadPromise;
}

let currentChannelFilter = '전체';
let pcTabActive = 'campaigns'; // 'campaigns' | 'report'

let map;
let markers = [];
let markerCluster = null;
let openInfoWindow = null;
let openPcCardPlaceId = null;
let openPcCardPlace = null;
let pcCardPanTimer = null;
let markerMap = {}; // placeId → { marker, infoWindow }
let selectedMarkerId = null;

// 모달 상태
let modalSelectedPlaceId = null;
let modalIsNewPlace = true;
let modalSelectedLat = null;
let modalSelectedLng = null;
let modalSelectedAddress = "";

// ===== 상수 =====
// 카테고리별 지도 핀: 색상 + 화이트 아이콘 (viewBox 0 0 30 30 기준)
const CATEGORY_PINS = {
  '음식점':    { color: '#E82A2D', icon: '<path d="M11 21.6667V15.5667C10.4 15.4111 9.91667 15.0944 9.55 14.6167C9.18333 14.1389 9 13.6 9 13V8.33333H10.3333V12.3333H11V8.33333H12.3333V12.3333H13V8.33333H14.3333V13C14.3333 13.6 14.15 14.1389 13.7833 14.6167C13.4167 15.0944 12.9333 15.4111 12.3333 15.5667V21.6667H11ZM17.6667 21.6667V15.3167C17.0667 15.1167 16.5833 14.6972 16.2167 14.0583C15.85 13.4194 15.6667 12.6944 15.6667 11.8833C15.6667 10.8944 15.9278 10.0556 16.45 9.36667C16.9722 8.67778 17.6 8.33333 18.3333 8.33333C19.0667 8.33333 19.6944 8.68056 20.2167 9.375C20.7389 10.0694 21 10.9111 21 11.9C21 12.7111 20.8167 13.4333 20.45 14.0667C20.0833 14.7 19.6 15.1167 19 15.3167V21.6667H17.6667Z" fill="#fff"/>' },
  '카페':      { color: '#C07C58', icon: '<path d="M9.66667 21V19.6667H20.3333V21H9.66667ZM12.3333 18.3333C11.6 18.3333 10.9722 18.0722 10.45 17.55C9.92778 17.0278 9.66667 16.4 9.66667 15.6667V9H20.3333C20.7 9 21.0139 9.13056 21.275 9.39167C21.5361 9.65278 21.6667 9.96667 21.6667 10.3333V12.3333C21.6667 12.7 21.5361 13.0139 21.275 13.275C21.0139 13.5361 20.7 13.6667 20.3333 13.6667H19V15.6667C19 16.4 18.7389 17.0278 18.2167 17.55C17.6944 18.0722 17.0667 18.3333 16.3333 18.3333H12.3333ZM19 12.3333H20.3333V10.3333H19V12.3333Z" fill="#fff"/>' },
  '뷰티':      { color: '#FFB619', icon: '<path d="M18.3333 21.6667C18.1444 21.6667 17.9861 21.6028 17.8583 21.475C17.7306 21.3472 17.6667 21.1889 17.6667 21C17.6667 20.8111 17.7306 20.6528 17.8583 20.525C17.9861 20.3972 18.1444 20.3333 18.3333 20.3333H20.3333V19H18.3333C18.1444 19 17.9861 18.9361 17.8583 18.8083C17.7306 18.6806 17.6667 18.5222 17.6667 18.3333C17.6667 18.1444 17.7306 17.9861 17.8583 17.8583C17.9861 17.7306 18.1444 17.6667 18.3333 17.6667H20.3333V16.3333H18.3333C18.1444 16.3333 17.9861 16.2694 17.8583 16.1417C17.7306 16.0139 17.6667 15.8556 17.6667 15.6667C17.6667 15.4778 17.7306 15.3194 17.8583 15.1917C17.9861 15.0639 18.1444 15 18.3333 15H20.3333V13.6667H18.3333C18.1444 13.6667 17.9861 13.6028 17.8583 13.475C17.7306 13.3472 17.6667 13.1889 17.6667 13C17.6667 12.8111 17.7306 12.6528 17.8583 12.525C17.9861 12.3972 18.1444 12.3333 18.3333 12.3333H20.3333V11H18.3333C18.1444 11 17.9861 10.9361 17.8583 10.8083C17.7306 10.6806 17.6667 10.5222 17.6667 10.3333C17.6667 10.1444 17.7306 9.98611 17.8583 9.85833C17.9861 9.73056 18.1444 9.66667 18.3333 9.66667H21C21.3667 9.66667 21.6806 9.79722 21.9417 10.0583C22.2028 10.3194 22.3333 10.6333 22.3333 11V20.3333C22.3333 20.7 22.2028 21.0139 21.9417 21.275C21.6806 21.5361 21.3667 21.6667 21 21.6667H18.3333ZM10.3333 21.6667L7.66667 14.3333L11 12.3333V8.33333H13.6667V12.3333L17 14.3333L14.3333 21.6667H10.3333Z" fill="#fff"/>' },
  '숙박/여가': { color: '#B063CC', icon: '<path d="M8.33333 19.6667V15.6667C8.33333 15.3667 8.39444 15.0944 8.51667 14.85C8.63889 14.6056 8.8 14.3889 9 14.2V12.3333C9 11.7778 9.19444 11.3056 9.58333 10.9167C9.97222 10.5278 10.4444 10.3333 11 10.3333H13.6667C13.9222 10.3333 14.1611 10.3806 14.3833 10.475C14.6056 10.5694 14.8111 10.7 15 10.8667C15.1889 10.7 15.3944 10.5694 15.6167 10.475C15.8389 10.3806 16.0778 10.3333 16.3333 10.3333H19C19.5556 10.3333 20.0278 10.5278 20.4167 10.9167C20.8056 11.3056 21 11.7778 21 12.3333V14.2C21.2 14.3889 21.3611 14.6056 21.4833 14.85C21.6056 15.0944 21.6667 15.3667 21.6667 15.6667V19.6667H20.3333V18.3333H9.66667V19.6667H8.33333ZM15.6667 13.6667H19.6667V12.3333C19.6667 12.1444 19.6028 11.9861 19.475 11.8583C19.3472 11.7306 19.1889 11.6667 19 11.6667H16.3333C16.1444 11.6667 15.9861 11.7306 15.8583 11.8583C15.7306 11.9861 15.6667 12.1444 15.6667 12.3333V13.6667ZM10.3333 13.6667H14.3333V12.3333C14.3333 12.1444 14.2694 11.9861 14.1417 11.8583C14.0139 11.7306 13.8556 11.6667 13.6667 11.6667H11C10.8111 11.6667 10.6528 11.7306 10.525 11.8583C10.3972 11.9861 10.3333 12.1444 10.3333 12.3333V13.6667Z" fill="#fff"/>' },
  '문화':      { color: '#2A76E8', icon: '<path d="M13.1333 17.6667L15 16.2667L16.8333 17.6667L16.1333 15.4L18 13.9333H15.7333L15 11.6667L14.2667 13.9333H12L13.8333 15.4L13.1333 17.6667ZM9.66667 20.3333C9.3 20.3333 8.98611 20.2028 8.725 19.9417C8.46389 19.6806 8.33333 19.3667 8.33333 19V16.75C8.33333 16.6278 8.37222 16.5222 8.45 16.4333C8.52778 16.3444 8.62778 16.2889 8.75 16.2667C9.01667 16.1778 9.23611 16.0167 9.40833 15.7833C9.58056 15.55 9.66667 15.2889 9.66667 15C9.66667 14.7111 9.58056 14.45 9.40833 14.2167C9.23611 13.9833 9.01667 13.8222 8.75 13.7333C8.62778 13.7111 8.52778 13.6556 8.45 13.5667C8.37222 13.4778 8.33333 13.3722 8.33333 13.25V11C8.33333 10.6333 8.46389 10.3194 8.725 10.0583C8.98611 9.79722 9.3 9.66667 9.66667 9.66667H20.3333C20.7 9.66667 21.0139 9.79722 21.275 10.0583C21.5361 10.3194 21.6667 10.6333 21.6667 11V13.25C21.6667 13.3722 21.6278 13.4778 21.55 13.5667C21.4722 13.6556 21.3722 13.7111 21.25 13.7333C20.9833 13.8222 20.7639 13.9833 20.5917 14.2167C20.4194 14.45 20.3333 14.7111 20.3333 15C20.3333 15.2889 20.4194 15.55 20.5917 15.7833C20.7639 16.0167 20.9833 16.1778 21.25 16.2667C21.3722 16.2889 21.4722 16.3444 21.55 16.4333C21.6278 16.5222 21.6667 16.6278 21.6667 16.75V19C21.6667 19.3667 21.5361 19.6806 21.275 19.9417C21.0139 20.2028 20.7 20.3333 20.3333 20.3333H9.66667Z" fill="#fff"/>' },
  '의류':      { color: '#14B8A6', icon: '<g transform="translate(7 7)"><path d="M14.3998 12.1333L8.66651 7.83328V7.22661C9.76651 6.89994 10.5332 5.77994 10.2865 4.52661C10.1132 3.65328 9.41985 2.92661 8.54651 2.72661C7.02651 2.37994 5.66651 3.53328 5.66651 4.99994H6.99985C6.99985 4.44661 7.44651 3.99994 7.99985 3.99994C8.55318 3.99994 8.99985 4.44661 8.99985 4.99994C8.99985 5.55994 8.53985 6.01328 7.97985 5.99994C7.61985 5.99328 7.33318 6.29994 7.33318 6.65994V7.83328L1.59985 12.1333C1.08651 12.5199 1.35985 13.3333 1.99985 13.3333H7.99985H13.9998C14.6398 13.3333 14.9132 12.5199 14.3998 12.1333ZM3.99985 11.9999L7.99985 8.99994L11.9998 11.9999H3.99985Z" fill="#fff"/></g>' },
  '안경/잡화': { color: '#E84393', icon: '<path d="M10.3333 21.6667C9.96667 21.6667 9.65278 21.5361 9.39167 21.275C9.13056 21.0139 9 20.7 9 20.3333V12.3333C9 11.9667 9.13056 11.6528 9.39167 11.3917C9.65278 11.1306 9.96667 11 10.3333 11H11.6667C11.6667 10.0778 11.9917 9.29167 12.6417 8.64167C13.2917 7.99167 14.0778 7.66667 15 7.66667C15.9222 7.66667 16.7083 7.99167 17.3583 8.64167C18.0083 9.29167 18.3333 10.0778 18.3333 11H19.6667C20.0333 11 20.3472 11.1306 20.6083 11.3917C20.8694 11.6528 21 11.9667 21 12.3333V20.3333C21 20.7 20.8694 21.0139 20.6083 21.275C20.3472 21.5361 20.0333 21.6667 19.6667 21.6667H10.3333ZM17.3583 15.3583C18.0083 14.7083 18.3333 13.9222 18.3333 13H17C17 13.5556 16.8056 14.0278 16.4167 14.4167C16.0278 14.8056 15.5556 15 15 15C14.4444 15 13.9722 14.8056 13.5833 14.4167C13.1944 14.0278 13 13.5556 13 13H11.6667C11.6667 13.9222 11.9917 14.7083 12.6417 15.3583C13.2917 16.0083 14.0778 16.3333 15 16.3333C15.9222 16.3333 16.7083 16.0083 17.3583 15.3583ZM13 11H17C17 10.4444 16.8056 9.97222 16.4167 9.58333C16.0278 9.19444 15.5556 9 15 9C14.4444 9 13.9722 9.19444 13.5833 9.58333C13.1944 9.97222 13 10.4444 13 11Z" fill="#fff"/>' },
  '기타':      { color: '#8E8E8E', icon: '<circle cx="10" cy="15" r="1.5" fill="#fff"/><circle cx="15" cy="15" r="1.5" fill="#fff"/><circle cx="20" cy="15" r="1.5" fill="#fff"/>' }
};
const DEFAULT_PIN = { color: '#8E8E8E', icon: '<circle cx="15" cy="15" r="2.2" fill="#fff"/>' };

// ===== 앱(Capacitor WebView) 인앱 브라우저 =====
// 앱에서는 외부 링크를 시스템 Safari로 튕기지 않고 앱 내부(iOS SFSafariViewController)에서 연다.
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
function openExternal(url) {
  if (!url) return;
  const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (isNativeApp() && B) {
    B.open({ url, presentationStyle: 'popover' }).catch(() => window.open(url, '_blank', 'noopener'));
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
// 앱에서 다른 도메인으로 향하는 링크 클릭을 가로채 인앱 브라우저로 연다(제보자·캠페인·후기 링크 공통).
if (isNativeApp()) {
  // 앱에서만 세이프에어리어 대응(지도 풀블리드 + 상단 UI를 노치 아래로). CSS `.native-app`로 분기.
  document.documentElement.classList.add('native-app');
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href) && href.indexOf(location.host) === -1) {
      e.preventDefault();
      openExternal(href);
    }
  }, true);
}
// 캠페인 없는(회색) 핀은 이 줌 이상에서만 노출 (네이버 스케일 50m ≈ zoom 17, 60m와 가장 가까운 단계)
const GRAY_PIN_MIN_ZOOM = 17;
let _grayPinVisible = null;

const PLATFORM_COLORS = {
  '레뷰': '#1D9E75', '리뷰노트': '#185FA5', '미블': '#854F0B',
  '강남맛집': '#993556', '디너의여왕': '#E05C00',
  '서울오빠': '#E8173A', '리뷰플레이스': '#5B3EC8',
  '포블로그': '#0066CC', '링블': '#00A86B', '체험뷰': '#FF6B00',
  '기타': '#666666'
};

function getCategoryPin(cat) {
  const p = CATEGORY_PINS[cat] || DEFAULT_PIN;
  return `<svg class="map-pin-svg" width="34" height="34" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">`
    + `<circle cx="15" cy="15" r="14" fill="#fff"/>`
    + `<circle cx="15" cy="15" r="14.5" stroke="#000" stroke-opacity="0.08"/>`
    + `<circle cx="15" cy="15" r="12" fill="${p.color}"/>`
    + p.icon
    + `</svg>`;
}

// 선택된 핀: 물방울(teardrop) 형태로 확대 + 흰 테두리 (기존 카테고리 아이콘 재사용)
function getCategoryPinSelected(cat) {
  const p = CATEGORY_PINS[cat] || DEFAULT_PIN;
  return `<svg class="map-pin-svg" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="M24 3.55675C28.5005 3.55684 32.8171 5.38047 36 8.63194H35.999C38.8639 11.5548 40.3793 14.8561 40.7793 18.3009C41.1758 21.7042 40.4635 25.0858 39.1445 28.212C36.533 34.4156 31.3755 40.005 26.457 43.631C25.7434 44.1586 24.8842 44.4444 24 44.4444C23.1152 44.4444 22.255 44.1583 21.541 43.63V43.629C16.6229 40.0028 11.4656 34.4127 8.85254 28.212C7.53549 25.0857 6.8255 21.7044 7.21973 18.2999V18.2989C7.61974 14.8559 9.13549 11.5565 12 8.63194L12.001 8.63097C15.1946 5.37825 19.5047 3.55254 24 3.55675Z" fill="${p.color}" stroke="#fff" stroke-width="1.77778"/>`
    + `<g transform="translate(3 1) scale(1.4)">${p.icon}</g>`
    + `</svg>`;
}

// 캠페인 없는(마감) 매장 핀: 회색(#BABABA) 원 + 흰 아이콘 opacity 50%
function getGrayPin(cat) {
  const p = CATEGORY_PINS[cat] || DEFAULT_PIN;
  return `<svg class="map-pin-svg" width="34" height="34" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">`
    + `<circle cx="15" cy="15" r="14" fill="#fff"/>`
    + `<circle cx="15" cy="15" r="14.5" stroke="#000" stroke-opacity="0.08"/>`
    + `<circle cx="15" cy="15" r="12" fill="#BABABA"/>`
    + `<g opacity="0.5">${p.icon}</g>`
    + `</svg>`;
}
function getGrayPinSelected(cat) {
  const p = CATEGORY_PINS[cat] || DEFAULT_PIN;
  return `<svg class="map-pin-svg" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="M24 3.55675C28.5005 3.55684 32.8171 5.38047 36 8.63194H35.999C38.8639 11.5548 40.3793 14.8561 40.7793 18.3009C41.1758 21.7042 40.4635 25.0858 39.1445 28.212C36.533 34.4156 31.3755 40.005 26.457 43.631C25.7434 44.1586 24.8842 44.4444 24 44.4444C23.1152 44.4444 22.255 44.1583 21.541 43.63V43.629C16.6229 40.0028 11.4656 34.4127 8.85254 28.212C7.53549 25.0857 6.8255 21.7044 7.21973 18.2999V18.2989C7.61974 14.8559 9.13549 11.5565 12 8.63194L12.001 8.63097C15.1946 5.37825 19.5047 3.55254 24 3.55675Z" fill="#BABABA" stroke="#fff" stroke-width="1.77778"/>`
    + `<g transform="translate(3 1) scale(1.4)" opacity="0.5">${p.icon}</g>`
    + `</svg>`;
}
// 매장 상태에 맞는 핀 HTML (활성 캠페인 있으면 카테고리 컬러, 없으면 회색)
function getPlacePin(place, selected) {
  const active = hasActiveCampaign(place.id);
  if (selected) return active ? getCategoryPinSelected(place.category) : getGrayPinSelected(place.category);
  return active ? getCategoryPin(place.category) : getGrayPin(place.category);
}

function setSelectedMarker(placeId) {
  if (selectedMarkerId === placeId) return;
  clearSelectedMarker();
  const entry = markerMap[placeId];
  const place = places.find(p => p.id === placeId);
  if (!entry || !place) return;
  entry.marker.setIcon({
    content: `<div class="map-pin map-pin-selected">${getPlacePin(place, true)}</div>`,
    anchor: new naver.maps.Point(24, 45)
  });
  entry.marker.setZIndex(1000);
  selectedMarkerId = placeId;
}

function clearSelectedMarker() {
  if (selectedMarkerId == null) return;
  const entry = markerMap[selectedMarkerId];
  const place = places.find(p => p.id === selectedMarkerId);
  if (entry && place) {
    entry.marker.setIcon({
      content: `<div class="map-pin">${getPlacePin(place, false)}</div>`,
      anchor: new naver.maps.Point(17, 17)
    });
    entry.marker.setZIndex(0);
  }
  selectedMarkerId = null;
}
function getPlatformColor(p) { return PLATFORM_COLORS[p] || '#666666'; }

// 브라우저 로컬 시간대와 무관하게 한국시간(KST) 기준 "오늘"을 계산한다.
function getKSTDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const obj = {};
  parts.forEach(p => { obj[p.type] = p.value; });
  return { y: +obj.year, m: +obj.month, d: +obj.day };
}
function getKSTTodayUTC() {
  const { y, m, d } = getKSTDateParts();
  return Date.UTC(y, m - 1, d);
}
function deadlineToUTC(deadline) {
  if (!deadline) return Infinity;
  const [y, m, d] = deadline.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function getDeadlineText(deadline) {
  if (!deadline) return null;
  const today = getKSTTodayUTC();
  const diff = Math.round((deadlineToUTC(deadline) - today) / 86400000);
  if (diff < 0) return null;
  if (diff === 0) return { text: 'D-DAY', urgent: true };
  if (diff <= 2) return { text: `D-${diff}`, urgent: true };
  return { text: `D-${diff}`, urgent: false };
}

// 활성 캠페인 캐시: placeId -> 활성 캠페인[] 를 1회만 구성해 재사용.
// 렌더(마커/사이드바)마다 매장×캠페인을 반복 스캔하던 것을 캠페인 1회 순회로 줄임.
// 캐시는 명시적으로만 무효화(데이터 로드/제보/채널필터 변경) — 핫패스에서 날짜 재계산을 피하기 위함.
let _activeByPlace = null;
function invalidateActiveCache() { _activeByPlace = null; }
function getActiveByPlaceMap() {
  if (_activeByPlace) return _activeByPlace;
  const today = getKSTTodayUTC();
  const m = new Map();
  for (const c of campaigns) {
    if (c.hidden) continue;
    if (deadlineToUTC(c.deadline) < today) continue;
    if (currentChannelFilter !== '전체' && !(c.channels || []).includes(currentChannelFilter)) continue;
    let arr = m.get(c.placeId);
    if (!arr) { arr = []; m.set(c.placeId, arr); }
    arr.push(c);
  }
  _activeByPlace = m;
  return m;
}
function getActiveCampaigns(placeId) {
  return getActiveByPlaceMap().get(placeId) || [];
}

function filterChannel(channel) {
  currentChannelFilter = channel;
  invalidateActiveCache();
  document.querySelectorAll('.filter-chip').forEach(btn => {
    const ch = btn.dataset.channel || btn.textContent.replace(/\s/g, '');
    btn.classList.toggle('active', ch === channel);
  });
  renderAll();
}

function hasActiveCampaign(placeId) {
  const place = places.find(p => p.id === placeId);
  if (place && place.hidden) return false;
  const arr = getActiveByPlaceMap().get(placeId);
  return !!arr && arr.length > 0;
}

// ===== 조회/클릭수 트래킹 (표시는 나중, 데이터는 지금부터 누적) =====
const _trackedViews = new Set();
function trackCampaignView(id) {
  if (!id || _trackedViews.has(id)) return; // 세션당 캠페인 1회 (서버는 IP+일자로 추가 중복 제거)
  _trackedViews.add(id);
  fetch(`/api/campaigns?track=view&id=${id}`, { method: 'POST', keepalive: true }).catch(() => {});
}
function trackPlaceCampaignViews(place) {
  if (!place) return;
  getActiveCampaigns(place.id).forEach(c => trackCampaignView(c.id));
}
function trackCampaignClick(id) {
  if (!id) return;
  fetch(`/api/campaigns?track=click&id=${id}`, { method: 'POST', keepalive: true }).catch(() => {});
}

function trackReviewClick(id) {
  if (!id) return;
  fetch(`/api/places?reviews=track&id=${id}`, { method: 'POST', keepalive: true }).catch(() => {});
}

// 파트너(플랫폼) 신청 링크 노출 스위치.
// false(오픈 전): 링크 버튼을 전부 숨김 — Referer로 우리 URL이 파트너 플랫폼에 노출되는 것 방지.
// true: 캠페인의 실제 신청 링크(c.link)를 노출 → 클릭 시 해당 플랫폼 상세로 이동. (2026-07-31 켬)
const LINKS_ENABLED = true;
function campaignLink(c) {
  if (!LINKS_ENABLED) return null;
  return c && c.link ? c.link : null;
}

// 앱 다운로드 카드(지도 좌하단, PC) 노출 스위치.
// false: 앱 스토어 출시 전까지 카드 숨김(현재는 스토어 링크·QR이 비어 있는 placeholder).
// true(앱 출시일): 스토어 URL·QR을 채운 뒤 켜면 카드 노출.
const APP_DOWNLOAD_ENABLED = false;
function initAppDownloadCard() {
  const el = document.getElementById('pcAppDownload');
  if (el) el.style.display = APP_DOWNLOAD_ENABLED ? '' : 'none';
}

// 링크 방어: 프로토콜(https://) 없이 저장된 외부 URL(어드민/엑셀 업로드 등)도 항상 절대 URL로 만들어
// 앱 인앱 브라우저 인터셉터가 놓치지 않고 웹뷰로 열도록 함. 앱 입력은 이미 https를 붙이지만 이중 방어.
function httpUrl(u) {
  if (!u) return u;
  return /^https?:\/\//i.test(u) ? u : 'https://' + String(u).replace(/^\/+/, '');
}

function hasPlatformAlready(placeId, platform) {
  const today = getKSTTodayUTC();
  return campaigns.some(c => c.placeId === placeId && !c.hidden && c.platform === platform && deadlineToUTC(c.deadline) >= today);
}

// ===== 지도 초기화 =====
function initMap() {
  map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(37.5563, 126.9980),
    zoom: 11,
    mapTypeControl: false,
    scaleControl: false,
    logoControl: true,
    logoControlOptions: { position: naver.maps.Position.BOTTOM_LEFT },
    mapDataControl: false,
    scrollWheel: false
  });

  // 마우스휠 줌 속도 조절: SDK 기본값(1 notch = 1 zoom)이 너무 빠르므로
  // ~2 notch당 1 zoom으로 조절 (naver.com 지도와 유사한 감도)
  let _wheelAccum = 0;
  document.getElementById('map').addEventListener('wheel', function(e) {
    if (document.getElementById('modalOverlay').classList.contains('open') ||
        document.getElementById('aboutOverlay').classList.contains('open') ||
        document.getElementById('reportOverlay').classList.contains('open')) {
      return;
    }
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 30;
    else if (e.deltaMode === 2) delta *= 300;
    _wheelAccum += delta;
    const step = 200;
    while (Math.abs(_wheelAccum) >= step) {
      map.setZoom(map.getZoom() + (_wheelAccum > 0 ? -1 : 1), true);
      _wheelAccum -= Math.sign(_wheelAccum) * step;
    }
  }, { passive: false });

  // PC: 사이드패널(제보/신고/소개/내정보)이 열려 지도가 어두워진 상태에서
  // 지도 영역을 클릭하면 패널을 닫고 자연스럽게 협찬찾기(지도)로 복귀
  document.getElementById('map').addEventListener('click', function(e) {
    if (window.innerWidth <= 640) return;
    // PC 카드(매장 상세) 내부 클릭(신고하기 등)은 '지도 클릭'으로 보지 않음 — 방금 연 패널이 바로 닫히던 버그 방지
    if (e.target.closest('#pcCard')) return;
    const b = document.body.classList;
    if (b.contains('pc-report-mode') || b.contains('pc-reportissue-mode') ||
        b.contains('pc-about-mode') || b.contains('pc-myinfo-mode')) {
      switchPcTab('campaigns');
    }
  });

  // 모바일: 네이버 로고를 바텀시트 위로 올림
  if (window.innerWidth <= 640) {
    const liftNaverLogo = () => {
      const mapDiv = document.getElementById('map');
      const logoA = [...mapDiv.querySelectorAll('a')].find(a => {
        const r = a.getBoundingClientRect();
        return r.x < 80 && r.y > 100 && r.width > 0;
      });
      const logoContainer = logoA?.parentElement?.parentElement;
      if (logoContainer && logoContainer.style.bottom === '0px') {
        // 앱은 콜랩스 바텀시트가 세이프에어리어만큼 더 높으므로 로고도 그만큼 더 올려야 가려지지 않음(웹은 env=0)
        logoContainer.style.bottom = 'calc(86px + env(safe-area-inset-bottom))';
      } else if (!logoContainer) {
        setTimeout(liftNaverLogo, 300);
      }
    };
    setTimeout(liftNaverLogo, 500);
  }

  naver.maps.Event.addListener(map, 'click', () => {
    closePcCard();
    if (openInfoWindow) { openInfoWindow.close(); openInfoWindow = null; }
    // 모바일: 지도 터치 시 사이드바 닫기
    if (window.innerWidth <= 640) {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.remove('expanded');
      sidebar.classList.remove('expanded-full');
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
      const arrow = document.getElementById('sidebarArrow');
      if (arrow) arrow.textContent = '︿';
    }
  });

  // 지도를 드래그(이동)하면 열려 있는 팝업/시트 닫기
  naver.maps.Event.addListener(map, 'dragstart', () => {
    closePcCard();
    if (openInfoWindow) { openInfoWindow.close(); openInfoWindow = null; }
    const sheet = document.getElementById('mobileSheet');
    if (window.innerWidth <= 640 && sheet && sheet.classList.contains('show')) {
      closeMobileSheet();
    }
  });

  naver.maps.Event.addListener(map, 'zoom_changed', () => {
    if (window.innerWidth > 640) closePcCard();
  });

  // 지도 이동/줌이 멈추면(idle) 현재 보이는 영역 기준으로 하단 '모집 중인 협찬' 리스트 갱신
  naver.maps.Event.addListener(map, 'idle', () => { renderSidebar(); });

  // 지도 밖 영역 클릭 시 PC 카드 닫기
  document.addEventListener('click', (e) => {
    if (!openPcCardPlaceId) return;
    if (e.target.closest('.map-pin')) return;
    if (e.target.closest('#pcCard')) return;
    if (e.target.closest('#map') && !e.target.closest('.mobile-search-bar') && !e.target.closest('.btn-my-location')) return;
    closePcCard();
  });

  renderAll();
  initSidebarScrollExpand();
  initSidebarSwipeToDismiss();
  initSheetSwipeToDismiss();
  // 실행 시 자동 위치이동은 하지 않음(현재 서울만 등록 → 서울 전역 기본). '내 위치' 버튼으로만 현재위치 적용.
  // tryInitialLocation();
  showBannerPopup();
}

// 내 위치 표시 마커 (사용자 SVG + 큰 원 pulse 애니메이션)
let myLocationMarker = null;
function showMyLocationMarker(lat, lng) {
  const pos = new naver.maps.LatLng(lat, lng);
  if (myLocationMarker) { myLocationMarker.setPosition(pos); return; }
  myLocationMarker = new naver.maps.Marker({
    position: pos,
    map,
    zIndex: 1000,
    clickable: false,
    icon: {
      content: '<div class="my-loc-marker"><span class="my-loc-ripple"></span><img src="image/ic_my_local_24.svg" width="24" height="24" alt="내 위치" draggable="false"></div>',
      anchor: new naver.maps.Point(12, 12)
    }
  });
}

// 검색 결과 위치 핀 (image/ic_pin_28.svg) — 검색할 때마다 위치 갱신, 다른 검색/선택 시 제거
let searchPinMarker = null;
function showSearchPin(lat, lng) {
  // 매 검색마다 재생성 → 바운스 드롭 인터랙션이 다시 재생됨
  clearSearchPin();
  searchPinMarker = new naver.maps.Marker({
    position: new naver.maps.LatLng(lat, lng),
    map,
    zIndex: 900,
    clickable: false,
    icon: {
      content: '<div class="search-pin"><span class="search-pin-ring"></span><img src="image/ic_pin_28.svg" width="28" height="28" alt="검색 위치" draggable="false"></div>',
      anchor: new naver.maps.Point(14, 25)
    }
  });
}
function clearSearchPin() {
  if (searchPinMarker) { searchPinMarker.setMap(null); searchPinMarker = null; }
}

// 최초 진입 시 내 위치로 지도 중심 이동 (권한 거부/실패 시 기본 위치 유지)
function tryInitialLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      map.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
      map.setZoom(15);
      showMyLocationMarker(pos.coords.latitude, pos.coords.longitude);
      renderSidebar();
    },
    () => {},
    { timeout: 5000 }
  );
}

// ===== 공지/이벤트 배너 팝업 =====
function getActiveBanner() {
  const today = getKSTTodayUTC();
  return banners.find(b => !b.hidden && deadlineToUTC(b.startDate) <= today && today <= deadlineToUTC(b.endDate));
}

function showBannerPopup() {
  const banner = getActiveBanner();
  if (!banner) return;
  const dismissedDate = localStorage.getItem('bannerDismissedDate');
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  if (dismissedDate === todayStr) return;

  const overlay = document.getElementById('bannerPopupOverlay');
  const img = document.getElementById('bannerPopupImage');
  img.src = banner.imageUrl;
  img.onclick = () => { if (banner.linkUrl) openExternal(banner.linkUrl); };
  img.style.cursor = banner.linkUrl ? 'pointer' : 'default';
  overlay.classList.add('show');
}

function closeBannerPopup() {
  document.getElementById('bannerPopupOverlay').classList.remove('show');
}

function dismissBannerToday() {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  localStorage.setItem('bannerDismissedDate', todayStr);
  closeBannerPopup();
}

// 좌표가 거의 같은 장소(한 건물에 여러 매장 입점 등)는 마커가 완전히 겹치므로
// 같은 그룹끼리 작은 원형으로 살짝 흩어서(jitter) 항상 클릭 가능하게 한다
function getJitteredPositions(activePlaces) {
  const OVERLAP_THRESHOLD_M = 8;
  const SPREAD_RADIUS_M = 15;
  const result = {};
  const used = new Set();

  activePlaces.forEach(place => {
    if (used.has(place.id)) return;
    const group = activePlaces.filter(p => {
      const dLat = (p.lat - place.lat) * 111000;
      const dLng = (p.lng - place.lng) * 88000;
      return Math.sqrt(dLat * dLat + dLng * dLng) < OVERLAP_THRESHOLD_M;
    });
    group.forEach(p => used.add(p.id));

    if (group.length === 1) {
      result[place.id] = { lat: place.lat, lng: place.lng };
      return;
    }

    const centerLat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    const centerLng = group.reduce((s, p) => s + p.lng, 0) / group.length;
    group.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      result[p.id] = {
        lat: centerLat + (SPREAD_RADIUS_M / 111000) * Math.cos(angle),
        lng: centerLng + (SPREAD_RADIUS_M / 88000) * Math.sin(angle)
      };
    });
  });

  return result;
}

// ===== 마커 렌더 =====
function renderMarkers() {
  if (markerCluster) { markerCluster.setMap(null); markerCluster = null; }
  markers.forEach(m => m.setMap(null));
  markers = [];
  markerMap = {};
  selectedMarkerId = null;

  // 매장 중심: 진행 중 캠페인 있는(컬러) 핀은 항상 노출.
  // 캠페인 없는(회색) 핀은 많이 확대(네이버 스케일 20m ≈ zoom 19)했을 때만 노출해 저줌 클러터 방지.
  const showGrayPins = map.getZoom() >= GRAY_PIN_MIN_ZOOM;
  _grayPinVisible = showGrayPins;
  const visiblePlaces = places.filter(place => !place.hidden && (hasActiveCampaign(place.id) || showGrayPins));
  const jitteredPositions = getJitteredPositions(visiblePlaces);

  // 줌이 임계값을 넘나들 때만 다시 렌더 (리스너 1회 등록)
  if (!renderMarkers._zoomBound) {
    renderMarkers._zoomBound = true;
    naver.maps.Event.addListener(map, 'zoom_changed', () => {
      if ((map.getZoom() >= GRAY_PIN_MIN_ZOOM) !== _grayPinVisible) renderMarkers();
    });
  }

  visiblePlaces.forEach(place => {
    const icon = getPlacePin(place, false);
    const pos = jitteredPositions[place.id];
    place.displayLat = pos.lat;
    place.displayLng = pos.lng;

    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(pos.lat, pos.lng),
      icon: {
        content: `<div class="map-pin">${icon}</div>`,
        anchor: new naver.maps.Point(17, 17)
      }
    });

    naver.maps.Event.addListener(marker, 'click', () => {
      if (window.innerWidth <= 640) {
        // 모바일: 바텀시트
        openMobileSheet(place);
      } else {
        // PC: 팝업 카드
        openPcCard(place);
      }
    });

    markers.push(marker);
    markerMap[place.id] = { marker };
  });

  // 클러스터링
  if (typeof MarkerClustering !== 'undefined') {
    const clusterIcon = [{
      content: '<div class="cluster-marker"><span class="cluster-count">0</span></div>',
      size: new naver.maps.Size(44, 44),
      anchor: new naver.maps.Point(22, 22)
    }];

    markerCluster = new MarkerClustering({
      minClusterSize: 2,
      maxZoom: 14,
      map: map,
      markers: markers,
      disableClickZoom: false,
      gridSize: 80,
      icons: clusterIcon,
      indexGenerator: [1],
      stylingFunction: function(clusterMarker, count) {
        const el = clusterMarker.getElement();
        if (el) {
          const c = el.querySelector('.cluster-count');
          if (c) c.textContent = count;
        }
      }
    });
  } else {
    markers.forEach(m => m.setMap(map));
  }
}

// ===== 인포윈도우 =====
function createInfoContent(place) {
  const active = getActiveCampaigns(place.id);
  const ALL_DAYS = ['월','화','수','목','금','토','일'];

  const founderHtml = place.founderNickname ? `
    <div class="iw-founder">
      <span class="iw-founder-label">최초제보자</span>
      <div class="iw-founder-right">
        <img src="image/ic_workspace_premium_24.svg" width="20" height="20" alt="">
        <div class="iw-founder-name-group">
          ${place.founderUrl
            ? `<a class="iw-founder-name" href="${httpUrl(place.founderUrl)}" target="_blank">${place.founderNickname}</a><img src="image/ic_chevron_right_blue.svg" class="iw-founder-chevron" alt="">`
            : `<span class="iw-founder-name">${place.founderNickname}</span>`}
        </div>
      </div>
    </div>` : '';

  const campaignsHtml = active.length > 0
    ? active.map((c, i) => {
        const color = getPlatformColor(c.platform);
        const dl = getDeadlineText(c.deadline);
        const rightBtnHtml = dl
          ? `<span class="iw-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>`
          : '';
        const chIconsHtml = (c.channels || []).map(ch =>
          CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}" style="border-radius:4px;display:block;">` : ''
        ).join('');

        let daysHtml = '';
        if (c.operatingDays && c.operatingDays.length > 0) {
          const daysFormatted = ALL_DAYS.map(d => {
            const isActive = c.operatingDays.includes(d);
            return `<span style="color:${isActive ? '#000' : '#ccc'}">${d}</span>`;
          }).join(' ');
          const holidayBadge = c.excludeHoliday ? ` <span style="color:#000">/ 공휴일 불가</span>` : '';
          daysHtml = `
            <div class="iw-info-row">
              <div class="iw-info-label-group">
                <img src="image/ic_calendar_20.svg" width="20" height="20" alt="">
                <span class="iw-info-label">요일</span>
              </div>
              <span class="iw-info-value">${daysFormatted}${holidayBadge}</span>
            </div>`;
        }

        const hoursHtml = c.operatingHours ? `
          <div class="iw-info-row">
            <div class="iw-info-label-group">
              <img src="image/ic_clock_20.svg" width="20" height="20" alt="">
              <span class="iw-info-label">시간</span>
            </div>
            <span class="iw-info-value">${c.operatingHours}</span>
          </div>` : '';

        const reporterUrl = c.reporterBlog || c.reporterInstagram || c.reporterUrl || '';
        const reporterHtml = c.reporterNickname ? `
          <div class="iw-info-row">
            <div class="iw-info-label-group">
              <img src="image/ic_account_20.svg" width="20" height="20" alt="">
              <span class="iw-info-label">제보</span>
            </div>
            ${reporterUrl
              ? `<div class="iw-reporter-group"><a class="iw-reporter-link" href="${httpUrl(reporterUrl)}" target="_blank" onclick="trackCampaignClick(${c.id})">${c.reporterNickname}</a><img src="image/ic_chevron_right_gray.svg" style="display:block;flex-shrink:0;" alt=""></div>`
              : `<span class="iw-info-value">${c.reporterNickname}</span>`}
          </div>` : '';

        const divider = i > 0 ? '<div class="iw-divider"></div>' : '';

        return `
          ${divider}
          <div class="iw-campaign">
            <div class="iw-campaign-header">
              <div class="iw-platform-channels" style="flex:1;min-width:0;">
                <span class="iw-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
                ${chIconsHtml ? `<span class="iw-ch-icons">${chIconsHtml}</span>` : ''}
              </div>
              ${rightBtnHtml}
            </div>
            <p class="iw-content">${c.content}</p>
            <div class="iw-info-rows">${daysHtml}${hoursHtml}${reporterHtml}</div>
            ${campaignLink(c) ? `<a class="apply-btn" href="${httpUrl(campaignLink(c))}" target="_blank" onclick="trackCampaignClick(${c.id})">상세보기</a>` : ''}
          </div>`;
      }).join('')
    : '';

  return `
    <div class="info-window">
      <div class="iw-place">
        <div class="iw-name-row">
          <div class="iw-name-text-group iw-name-link" onclick="openNaverMapByPlace(${place.id})" title="네이버지도에서 보기">
            <span class="iw-name">${place.name}</span>
            <img src="image/ic_link_16.svg" width="16" height="16" class="iw-name-link-icon" alt="네이버지도에서 보기">
          </div>
          <span class="iw-report-link" onclick="openReportModalForPlace(${place.id})">신고하기</span>
          <button class="pc-card-close" onclick="closePcCard()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3L13 13M13 3L3 13" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="iw-address">${place.address}</div>
      </div>
      ${founderHtml ? `<div class="iw-meta-founder">${founderHtml}</div>` : ''}
      ${detailTabsHtml(place)}
      <div class="rv-line"></div>
      <div class="rv-tab-body" id="rvTabBody">
        <div class="rv-pane rv-pane-campaign"${active.length ? '' : ' style="display:none"'}>${active.length ? `<div class="iw-campaigns-wrap">${campaignsHtml}</div>` : campaignEmptyHtml(place)}</div>
        <div class="rv-pane rv-pane-review"${active.length ? ' style="display:none"' : ''}></div>
      </div>
    </div>`;
}

function createMobileDetailContent(place) {
  const active = getActiveCampaigns(place.id);

  // 최초제보
  const founderHtml = place.founderNickname ? `
    <div class="detail-founder">
      <span class="detail-founder-label">최초제보자</span>
      <div class="detail-founder-right">
        <img src="image/ic_workspace_premium_24.svg" width="20" height="20" alt="" class="detail-founder-icon-img">
        <div class="detail-founder-name-group">
          ${place.founderUrl
            ? `<a class="detail-founder-link" href="${httpUrl(place.founderUrl)}" target="_blank">${place.founderNickname}</a><img src="image/ic_chevron_right_blue.svg" class="detail-founder-chevron" alt="">`
            : `<span class="detail-founder-link">${place.founderNickname}</span>`}
        </div>
      </div>
    </div>` : '';

  // 캠페인 카드
  const ALL_DAYS = ['월','화','수','목','금','토','일'];
  const WEEKEND = new Set(['토','일']);

  const campaignsHtml = active.map((c, i) => {
    const color = getPlatformColor(c.platform);
    const dl = getDeadlineText(c.deadline);
    const rightBtnHtml = dl
      ? `<span class="detail-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>`
      : '';
    const chIconsHtml = (c.channels || []).map(ch =>
      CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}" style="border-radius:4px;display:block;">` : ''
    ).join('');

    // 요일 렌더
    let daysHtml = '';
    if (c.operatingDays && c.operatingDays.length > 0) {
      const daysFormatted = ALL_DAYS
        .map(d => {
          const active = c.operatingDays.includes(d);
          return `<span class="${active ? 'day-active' : 'day-dim'}">${d}</span>`;
        })
        .join(' ');
      const holidayBadge = c.excludeHoliday ? ` <span class="holiday-badge-active">/ 공휴일 불가</span>` : '';
      daysHtml = `
        <div class="detail-info-row">
          <div class="detail-info-label-group">
            <img src="image/ic_calendar_20.svg" width="20" height="20" alt="" class="detail-info-icon">
            <span class="detail-info-label">요일</span>
          </div>
          <span class="detail-info-value">${daysFormatted}${holidayBadge}</span>
        </div>`;
    }

    const hoursHtml = c.operatingHours ? `
      <div class="detail-info-row">
        <div class="detail-info-label-group">
          <img src="image/ic_clock_20.svg" width="20" height="20" alt="" class="detail-info-icon">
          <span class="detail-info-label">시간</span>
        </div>
        <span class="detail-info-value">${c.operatingHours}</span>
      </div>` : '';

    const reporterUrl = c.reporterBlog || c.reporterInstagram || c.reporterUrl || '';
    const reporterHtml = c.reporterNickname ? `
      <div class="detail-info-row">
        <div class="detail-info-label-group">
          <img src="image/ic_account_20.svg" width="20" height="20" alt="" class="detail-info-icon">
          <span class="detail-info-label">제보</span>
        </div>
        ${reporterUrl
          ? `<div class="detail-reporter-group"><a class="detail-info-reporter-link" href="${httpUrl(reporterUrl)}" target="_blank" onclick="trackCampaignClick(${c.id})">${c.reporterNickname}</a><img src="image/ic_chevron_right_gray.svg" class="detail-reporter-chevron" alt=""></div>`
          : `<span class="detail-info-value">${c.reporterNickname}</span>`}
      </div>` : '';

    const divider = i > 0 ? '<div class="detail-divider"></div>' : '';

    return `
      ${divider}
      <div class="detail-campaign">
        <div class="detail-campaign-header">
          <div class="detail-campaign-tag-wrap">
            <span class="detail-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
            ${chIconsHtml ? `<span class="detail-ch-icons">${chIconsHtml}</span>` : ''}
          </div>
          ${rightBtnHtml}
        </div>
        <p class="detail-content">${c.content}</p>
        <div class="detail-info-rows">${daysHtml}${hoursHtml}${reporterHtml}</div>
        ${campaignLink(c) ? `<a class="apply-btn" href="${httpUrl(campaignLink(c))}" target="_blank" onclick="trackCampaignClick(${c.id})">상세보기</a>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="detail-fixed">
      <div class="detail-place">
        <div class="detail-name-row">
          <div class="detail-name-text-group detail-name-link" onclick="openNaverMapByPlace(${place.id})">
            <span class="detail-name">${place.name}</span>
            <img src="image/ic_link_16.svg" width="16" height="16" class="detail-name-link-icon" alt="네이버지도에서 보기">
          </div>
          <span class="detail-report-link" onclick="openReportModalForPlace(${place.id})">신고하기</span>
        </div>
        <div class="detail-address">${place.address}</div>
      </div>
      ${founderHtml ? `<div class="detail-meta-founder">${founderHtml}</div>` : ''}
      ${detailTabsHtml(place)}
      <div class="rv-line"></div>
    </div>
    <div class="detail-scroll">
      <div class="rv-tab-body" id="rvTabBody">
        <div class="rv-pane rv-pane-campaign"${active.length ? '' : ' style="display:none"'}>${active.length ? `<div class="detail-campaigns-wrap">${campaignsHtml}</div>` : campaignEmptyHtml(place)}</div>
        <div class="rv-pane rv-pane-review"${active.length ? ' style="display:none"' : ''}></div>
      </div>
    </div>`;
}

// ===== 후기(리뷰) 탭 + 리스트 + 등록 =====
let _detailPlaceId = null, _detailTab = 'campaign', _reviewSort = 'latest', _reviewLoaded = false;
let _reviewFormPlaceId = null, _reviewValidated = false;

function rvEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rvHeart() { return '<img class="rv-heart-off" src="image/ic_good_def.svg" width="16" height="14" alt=""><img class="rv-heart-on" src="image/ic_good_sel.svg" width="16" height="14" alt="">'; }
function fmtReviewDate(s) { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : ''; }

function detailTabsHtml(place) {
  const def = getActiveCampaigns(place.id).length ? 'campaign' : 'review';
  return `<div class="rv-tabs-row">
      <div class="rv-tabs">
        <button class="rv-tab${def === 'campaign' ? ' active' : ''}" data-tab="campaign" onclick="switchDetailTab(${place.id},'campaign')">캠페인</button>
        <button class="rv-tab${def === 'review' ? ' active' : ''}" data-tab="review" onclick="switchDetailTab(${place.id},'review')">후기</button>
      </div>
      <button class="rv-register-btn" onclick="openReviewForm(${place.id})"><img src="image/ic_naver_blog_20.png" width="20" height="20" alt="">후기 등록<img src="image/ic_chevron_right_gray.svg" width="8" height="8" alt="" class="rv-reg-chev"></button>
    </div>`;
}

function campaignEmptyHtml(place) {
  return `<div class="rv-empty">
      <p class="rv-empty-text"><b>${rvEsc(place.name)}</b>에는<br>진행 중인 협찬이 없어요.</p>
      <p class="rv-empty-sub">신규 캠페인이 있다면 제보해주세요.</p>
      <button class="rv-empty-btn" onclick="openReportForPlace(${place.id})">제보하기</button>
    </div>`;
}

// 상세 콘텐츠 주입 직후 호출 (기본 탭 결정 + 후기 탭이면 로드)
function initDetailTabs(place) {
  _detailPlaceId = place.id;
  _reviewLoaded = false;
  _reviewSort = 'latest';
  const def = getActiveCampaigns(place.id).length ? 'campaign' : 'review';
  _detailTab = def;
  if (def === 'review') { _reviewLoaded = true; loadReviews(place.id); }
  // PC 인포윈도우: 팝업 내부 휠 스크롤이 지도 줌으로 새는 것 방지 (휠 전파 차단 → 내부 스크롤만)
  const tb = document.getElementById('rvTabBody');
  if (tb) tb.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
}

function switchDetailTab(placeId, tab) {
  _detailTab = tab;
  const body = document.getElementById('rvTabBody');
  if (!body) return;
  const camp = body.querySelector('.rv-pane-campaign');
  const rev = body.querySelector('.rv-pane-review');
  if (camp) camp.style.display = tab === 'campaign' ? '' : 'none';
  if (rev) rev.style.display = tab === 'review' ? '' : 'none';
  document.querySelectorAll('.rv-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'review' && !_reviewLoaded) { _reviewLoaded = true; loadReviews(placeId); }
}

// 후기 로딩 로티(bodymovin, image/loading.json). 앱 초기 로딩과 동일 방식.
let _rvLoadingAnim = null;
function showReviewLoading(pane) {
  hideReviewLoading();
  pane.innerHTML = '<div class="rv-loading"><div class="rv-loading-anim" id="rvLoadingAnim"></div></div>';
  const el = document.getElementById('rvLoadingAnim');
  if (el && window.lottie) {
    _rvLoadingAnim = window.lottie.loadAnimation({
      container: el, renderer: 'svg', loop: true, autoplay: true,
      path: 'image/loading-review.json'
    });
  }
}
function hideReviewLoading() {
  if (_rvLoadingAnim) { try { _rvLoadingAnim.destroy(); } catch (e) {} _rvLoadingAnim = null; }
}
async function loadReviews(placeId, sort) {
  const pane = document.querySelector('#rvTabBody .rv-pane-review');
  if (!pane) return;
  if (sort) _reviewSort = sort;
  showReviewLoading(pane);
  try {
    const list = await fetch(`/api/places?reviews=list&placeId=${placeId}&sort=${_reviewSort === 'likes' ? 'likes' : 'latest'}`).then(r => r.json());
    hideReviewLoading();
    pane.innerHTML = renderReviewPane(placeId, Array.isArray(list) ? list : []);
  } catch (e) {
    hideReviewLoading();
    pane.innerHTML = '<div class="rv-loading">후기를 불러오지 못했어요.</div>';
  }
}

function renderReviewPane(placeId, list) {
  const place = places.find(p => p.id === placeId);
  if (!list.length) {
    return `<div class="rv-empty">
        <p class="rv-empty-text">현재 <b>${rvEsc(place ? place.name : '')}</b> 후기가 없어요.</p>
        <button class="rv-empty-btn" onclick="openReviewForm(${placeId})">후기 등록하기</button>
      </div>`;
  }
  const sortLabel = _reviewSort === 'likes' ? '좋아요 순' : '최신 순';
  return `<div class="rv-list-head">
      <span class="rv-count">총 ${list.length}건</span>
      <div class="rv-sort-wrap">
        <button class="rv-sort" onclick="event.stopPropagation();toggleSortMenu(this)">
          <span class="rv-sort-label">${sortLabel}</span>
          <img class="rv-sort-caret" src="image/ic_arrow_01.svg" width="9" height="5" alt="">
        </button>
        <div class="rv-sort-menu">
          <button class="rv-sort-opt${_reviewSort !== 'likes' ? ' active' : ''}" onclick="setReviewSort(${placeId},'latest')">최신 순</button>
          <button class="rv-sort-opt${_reviewSort === 'likes' ? ' active' : ''}" onclick="setReviewSort(${placeId},'likes')">좋아요 순</button>
        </div>
      </div>
    </div>
    <div class="rv-cards">${list.map(r => reviewCardHtml(r, false)).join('')}</div>`;
}

// 정렬 드롭다운 열고닫기 (바깥 클릭 시 닫힘)
function toggleSortMenu(btn) {
  const wrap = btn.closest('.rv-sort-wrap');
  if (!wrap) return;
  const willOpen = !wrap.classList.contains('open');
  document.querySelectorAll('.rv-sort-wrap.open').forEach(w => w.classList.remove('open'));
  if (willOpen) {
    wrap.classList.add('open');
    setTimeout(() => {
      const onDoc = (e) => {
        if (!wrap.contains(e.target)) { wrap.classList.remove('open'); document.removeEventListener('click', onDoc); }
      };
      document.addEventListener('click', onDoc);
    }, 0);
  }
}
function setReviewSort(placeId, sort) {
  document.querySelectorAll('.rv-sort-wrap.open').forEach(w => w.classList.remove('open'));
  if (_reviewSort === sort) return;
  loadReviews(placeId, sort);
}

function reviewCardHtml(r, isPreview) {
  const date = fmtReviewDate(r.postDate || r.createdAt);
  // 본인이 올린 후기에만 삭제 뱃지(썸네일 우하단) 노출
  const delBadge = (!isPreview && r.mine)
    ? `<button class="rv-del" onclick="event.stopPropagation();deleteMyReview(${r.id})" aria-label="후기 삭제"><img src="image/ic_trash_16.svg" width="16" height="16" alt=""></button>`
    : '';
  const thumbInner = r.thumbnail
    ? `<img src="${rvEsc(r.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('rv-thumb-empty');this.remove()">`
    : '';
  const thumb = `<div class="rv-thumb${r.thumbnail ? '' : ' rv-thumb-empty'}">${thumbInner}${delBadge}</div>`;
  const founderMedal = r.isFounder ? `<img class="rv-card-medal" src="image/ic_workspace_premium_24.svg" width="20" height="20" alt="최초 제보자">` : '';
  const authorCls = r.isFounder ? 'rv-card-author rv-card-author--founder' : 'rv-card-author';
  const byline = `<span class="rv-card-byline">${founderMedal}<span class="${authorCls}">${rvEsc(r.author)}</span>${date ? `<span class="rv-card-dot"></span><span class="rv-card-date">${date}</span>` : ''}</span>`;
  const meta = isPreview
    ? byline
    : `${byline}
       <button class="rv-like${r.liked ? ' liked' : ''}" onclick="event.stopPropagation();toggleReviewLike(${r.id}, this)">${rvHeart()}<span class="rv-like-count">${r.likeCount || 0}</span></button>`;
  const clickAttr = isPreview ? '' : ` onclick="trackReviewClick(${r.id});openExternal('${rvEsc(r.url)}')"`;
  return `<div class="rv-card"${clickAttr}>
      ${thumb}
      <div class="rv-card-body">
        <p class="rv-card-title">${rvEsc(r.title)}</p>
        <p class="rv-card-excerpt">${rvEsc(r.excerpt)}</p>
        <div class="rv-card-meta">${meta}</div>
      </div>
    </div>`;
}

function toggleReviewSort(placeId) {
  _reviewSort = _reviewSort === 'likes' ? 'latest' : 'likes';
  loadReviews(placeId, _reviewSort);
}

async function toggleReviewLike(reviewId, btnEl) {
  if (!currentUser) { openLoginSheet(); return; }
  if (btnEl._liking) return; // 연타 방지
  const cntEl = btnEl.querySelector('.rv-like-count');
  const wasLiked = btnEl.classList.contains('liked');
  const prevCount = parseInt(cntEl?.textContent || '0', 10) || 0;
  // 낙관적 업데이트: 서버 응답 기다리지 않고 즉시 반영 (느린 왕복 체감 제거)
  btnEl.classList.toggle('liked', !wasLiked);
  if (cntEl) cntEl.textContent = Math.max(0, prevCount + (wasLiked ? -1 : 1));
  btnEl._liking = true;
  try {
    const res = await fetch(`/api/places?reviews=like&id=${reviewId}`, { method: 'POST' });
    if (res.status === 401) { // 롤백 후 로그인 유도
      btnEl.classList.toggle('liked', wasLiked);
      if (cntEl) cntEl.textContent = prevCount;
      openLoginSheet(); return;
    }
    const data = await res.json();
    // 서버 확정값으로 정합화
    btnEl.classList.toggle('liked', !!data.liked);
    if (cntEl && data.likeCount != null) cntEl.textContent = data.likeCount;
  } catch (e) { // 실패 시 롤백
    btnEl.classList.toggle('liked', wasLiked);
    if (cntEl) cntEl.textContent = prevCount;
  } finally {
    btnEl._liking = false;
  }
}

// 본인이 올린 후기 삭제 (mine 플래그가 true인 카드에서만 호출됨, 서버도 본인/관리자만 허용)
async function deleteMyReview(reviewId) {
  showAlert('후기를 삭제할까요?', '삭제하면 되돌릴 수 없어요.', {
    twoButton: true, cancelText: '취소', confirmText: '삭제',
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/places?reviews=1&id=${reviewId}`, { method: 'DELETE' });
        if (!res.ok) { showToast('삭제에 실패했어요.'); return; }
        showToast('후기를 삭제했어요.');
        if (_detailPlaceId != null) loadReviews(_detailPlaceId);
      } catch (e) { showToast('삭제 중 오류가 발생했어요.'); }
    }
  });
}

function openReportForPlace(placeId) {
  if (typeof openModal !== 'function') return;
  openModal(); // 모바일: 오버레이+resetModal / PC: report 탭+resetModal (같은 #modalOverlay/#step1 재사용)
  const place = places.find(p => p.id === placeId);
  if (!place) return;
  // step1을 이 매장이 검색·선택된 상태로 구성해 시작(매장 검색 단계 생략).
  document.getElementById('inputName').value = place.name;
  lastSearchQuery = place.name;
  lastNaverResults = [];
  placeResultsVisibleCount = PLACE_RESULTS_PAGE_SIZE;
  selectExistingPlace(placeId); // modalSelected* 세팅 + 결과 리스트에 선택 상태로 렌더
}

// ===== 후기 등록 폼 =====
// 후기 폼 필드 에러 표시/해제 (제보 폼과 동일한 field-error 패턴: 입력행 아래 메시지 + 빨간 테두리)
function rvSetError(msg) {
  const err = document.getElementById('reviewFormError');
  const input = document.getElementById('reviewUrl');
  if (msg) { err.textContent = msg; err.classList.add('show'); if (input) input.classList.add('input-error'); }
  else { err.textContent = ''; err.classList.remove('show'); if (input) input.classList.remove('input-error'); }
}
function openReviewForm(placeId) {
  if (!currentUser) { openLoginSheet(); return; }
  _reviewFormPlaceId = placeId;
  _reviewValidated = false;
  document.getElementById('reviewUrl').value = '';
  document.getElementById('reviewPreview').innerHTML = '';
  rvSetError('');
  document.getElementById('reviewFormOverlay').classList.add('open');
}
function closeReviewForm() {
  document.getElementById('reviewFormOverlay').classList.remove('open');
  resetModalScroll('reviewFormOverlay');
}
async function validateReviewUrl() {
  const url = document.getElementById('reviewUrl').value.trim();
  const preview = document.getElementById('reviewPreview');
  rvSetError('');
  if (!url) { rvSetError('URL을 입력해주세요.'); return; }
  preview.innerHTML = '<div class="rv-loading">검증 중…</div>';
  _reviewValidated = false;
  try {
    const res = await fetch('/api/places?reviews=validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, placeId: _reviewFormPlaceId })
    });
    const data = await res.json();
    if (!data.ok) { preview.innerHTML = ''; rvSetError(data.reason || '검증에 실패했어요.'); return; }
    const previewAuthor = (currentUser && currentUser.nickname) || data.data.author;
    preview.innerHTML = `<p class="rv-preview-label">이 후기로 등록할까요?</p>` + reviewCardHtml(Object.assign({ likeCount: 0, liked: false, createdAt: '' }, data.data, { author: previewAuthor }), true);
    _reviewValidated = true;
  } catch (e) { preview.innerHTML = ''; rvSetError('검증 중 오류가 발생했어요.'); }
}
async function submitReview() {
  if (!_reviewValidated) { validateReviewUrl(); return; }
  const url = document.getElementById('reviewUrl').value.trim();
  const btn = document.getElementById('reviewSubmitBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/places?reviews=create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, placeId: _reviewFormPlaceId })
    });
    if (res.status === 401) { openLoginSheet(); return; }
    const data = await res.json();
    if (!res.ok) { rvSetError(data.error || data.reason || '등록에 실패했어요.'); btn.disabled = false; return; }
    closeReviewForm();
    showToast('후기가 등록되었어요!');
    if (_detailPlaceId === _reviewFormPlaceId) {
      _reviewLoaded = true;
      switchDetailTab(_reviewFormPlaceId, 'review');
      loadReviews(_reviewFormPlaceId);
    }
  } catch (e) { rvSetError('등록 중 오류가 발생했어요.'); btn.disabled = false; }
}

// ===== 사이드바 렌더 =====
const CHANNEL_ICONS = {
  '블로그': 'image/ic_naver_blog_20.png',
  '클립': 'image/ic_clip_20.png',
  '인스타그램': 'image/ic_instagram_20.png',
  '릴스': 'image/ic_reels_20.png',
  '유튜브': 'image/ic_youtube_20.png',
};

// 같은 마감일(D-day) 그룹 안에서 섞어 노출하기 위한 장소별 안정 난수.
// 페이지 로드마다 새로 생성 → 방문할 때마다 순서가 바뀌되, 세션 중엔 고정(지도 이동에도 안 튐).
// 배치 등록(강남맛집 N건 → 디너의여왕 N건)으로 같은 플랫폼이 뭉치는 것을 방지.
const _placeShuffleKey = new Map();
function placeShuffleKey(id) {
  if (!_placeShuffleKey.has(id)) _placeShuffleKey.set(id, Math.random());
  return _placeShuffleKey.get(id);
}

function renderSidebar() {
  const list = document.getElementById('campaignList');
  const countEl = document.getElementById('campaignCount');

  const bounds = map ? map.getBounds() : null;
  const visiblePlaces = bounds
    ? places.filter(p => bounds.hasLatLng(new naver.maps.LatLng(p.lat, p.lng)))
    : places;

  // 마감임박순: 장소별 활성 캠페인 중 가장 이른 마감일 오름차순(상시=Infinity는 맨 아래).
  // 마감일 동률이면 세션마다 무작위로 섞어 노출(같은 플랫폼 배치가 뭉치지 않게, 고정 편중 방지).
  const earliestDeadline = p => getActiveCampaigns(p.id).reduce((min, c) => {
    const d = deadlineToUTC(c.deadline);
    return d < min ? d : min;
  }, Infinity);
  const activePlaces = visiblePlaces
    .filter(p => hasActiveCampaign(p.id))
    .sort((a, b) => {
      const da = earliestDeadline(a), db = earliestDeadline(b);
      if (da !== db) return da - db;
      return placeShuffleKey(a.id) - placeShuffleKey(b.id);
    });
  countEl.textContent = activePlaces.length;

  if (activePlaces.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <img src="image/img_list_80.png" alt="" class="empty-img">
        <p>모집 중인 협찬이 없어요.<br>첫번째로 제보해 보세요!</p>
        <button class="empty-state-btn" onclick="openModal()">제보하기</button>
      </div>`;
    return;
  }

  const noticeHtml = '<div class="sidebar-notice">모집 일정·조건·내용은 변경될 수 있어요. 신청 전 <strong>해당 플랫폼에서 최신 정보를 꼭 확인</strong>해 주세요.</div>';
  list.innerHTML = noticeHtml + activePlaces.map(place => {
    const active = getActiveCampaigns(place.id);

    // 채널 아이콘 (중복 제거)
    const channels = [...new Set(active.flatMap(c => c.channels))];
    const channelIconsHtml = channels.map(ch =>
      CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}">` : ''
    ).join('');

    // 캠페인 행들
    const campaignsHtml = active.map(c => {
      const color = getPlatformColor(c.platform);
      const dl = getDeadlineText(c.deadline);
      const ddayHtml = dl ? `<span class="sb-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : '';
      return `
        <div class="sb-campaign">
          <span class="sb-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
          <span class="sb-content">${c.content}</span>
          ${ddayHtml}
        </div>`;
    }).join('');

    return `
      <div class="sb-item" onclick="focusPlace(${place.id})">
        <div class="sb-row-name">
          <span class="sb-name">${place.name}</span>
          <div class="sb-channels">${channelIconsHtml}</div>
        </div>
        <div class="sb-address">${place.address}</div>
        ${campaignsHtml}
      </div>`;
  }).join('');
  updateSidebarListFade();
}

// 바텀시트 리스트: 스크롤 위치에 따라 위/아래 화이트 페이드(마스크)를 조건부 적용.
// 맨 위면 위 페이드 없음, 맨 아래면 아래 페이드 없음 → 스크롤 가능한 방향에만 페이드가 생김.
function updateSidebarListFade() {
  const list = document.getElementById('campaignList');
  if (!list) return;
  if (window.innerWidth > 640) { list.style.webkitMaskImage = ''; list.style.maskImage = ''; return; }
  const atTop = list.scrollTop <= 4;
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  const topStop = atTop ? '0px' : '16px';
  const botStop = atBottom ? '100%' : 'calc(100% - 20px)';
  const g = `linear-gradient(to bottom, transparent 0, #000 ${topStop}, #000 ${botStop}, transparent 100%)`;
  list.style.webkitMaskImage = g;
  list.style.maskImage = g;
}

// 현재위치 조회 통합: 앱은 Capacitor Geolocation(네이티브), 웹은 navigator.geolocation.
// 둘 다 {lat, lng}로 resolve → 이후 지도 이동 동작은 웹/앱 동일.
function getGeoPosition() {
  const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
  if (isNativeApp() && G) {
    return G.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
      .then(p => ({ lat: p.coords.latitude, lng: p.coords.longitude }));
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('geolocation unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}
function moveToMyLocation() {
  const btn = document.querySelector('.btn-my-location');
  if (btn) { btn.style.opacity = '0.4'; btn.disabled = true; }
  const restore = () => { if (btn) { btn.style.opacity = ''; btn.disabled = false; } };
  getGeoPosition().then(({ lat, lng }) => {
    map.setCenter(new naver.maps.LatLng(lat, lng));
    map.setZoom(15);
    showMyLocationMarker(lat, lng);
    restore();
    renderSidebar();
  }).catch(() => { showToast('위치 권한을 허용해주세요'); restore(); });
}

function focusPlace(placeId, zoom) {
  const place = places.find(p => p.id === placeId);
  if (!place) return;

  map.setCenter(new naver.maps.LatLng(place.displayLat ?? place.lat, place.displayLng ?? place.lng));
  map.setZoom(zoom || 16);
  // 종료(비활성) 매장은 이 줌(≥GRAY_PIN_MIN_ZOOM)에서만 회색핀이 뜬다. 현재 마커가 없으면
  // 새 줌 기준으로 다시 그려 회색핀을 만들어야 아래 상세 오픈에서 setSelectedMarker가 핀을 선택함.
  if (!markerMap[placeId]) renderMarkers();

  if (window.innerWidth <= 640) {
    // 모바일: 바텀시트 열고 사이드바 닫기
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('expanded');
    sidebar.classList.remove('expanded-full');
    const arrow = document.getElementById('sidebarArrow');
    if (arrow) arrow.textContent = '︿';
    setTimeout(() => openMobileSheet(place), 150);
    setTimeout(() => {
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
    }, 350);
  } else {
    // PC: 팝업 카드 열기
    setTimeout(() => openPcCard(place), 200);
  }
}

function panToCard(place) {
  const latlng = new naver.maps.LatLng(place.displayLat ?? place.lat, place.displayLng ?? place.lng);
  const proj = map.getProjection();
  const mapWidth = document.getElementById('map').offsetWidth;
  // 핀을 지도 정중앙에 두고, 카드는 핀 기준 좌측에 고정 간격(370px)으로 따라붙음.
  // 화면이 좁아져 카드가 좌측 최소 여백(20px)에 닿으면 핀도 같이 좌측으로 밀림
  const CARD_LEFT_MIN = 20;
  const PIN_OFFSET = 370;
  const cardLeft = Math.max(CARD_LEFT_MIN, Math.round(mapWidth / 2 - PIN_OFFSET));
  document.getElementById('pcCard').style.left = cardLeft + 'px';

  const pinTargetX = cardLeft + PIN_OFFSET;
  const deltaX = Math.round(mapWidth / 2) - pinTargetX;
  if (proj && deltaX !== 0) {
    const off = proj.fromCoordToOffset(latlng);
    off.x += deltaX;
    map.panTo(proj.fromOffsetToCoord(off));
  } else {
    map.panTo(latlng);
  }
}

function openPcCard(place) {
  if (openPcCardPlaceId === place.id) { closePcCard(); return; }
  openPcCardPlaceId = place.id;
  openPcCardPlace = place;
  document.getElementById('pcCardContent').innerHTML = createInfoContent(place);
  initDetailTabs(place);
  document.getElementById('pcCard').classList.add('visible');
  setSelectedMarker(place.id);
  panToCard(place);
  trackPlaceCampaignViews(place);
}

function closePcCard() {
  if (!openPcCardPlaceId) return;
  openPcCardPlaceId = null;
  openPcCardPlace = null;
  document.getElementById('pcCard').classList.remove('visible');
  clearSelectedMarker();
}

function renderAll() {
  renderMarkers();
  renderSidebar();
}

// ===== 지역 검색 =====
function searchRegion() {
  const query = document.getElementById('regionSearch').value.trim();
  if (!query) return;

  // 1. 등록된 매장명과 정확히 일치하는 매장 찾기
  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(query);
  const placeMatches = places.filter(p => normalize(p.name) === nq);
  if (placeMatches.length === 1) {
    // 정확 일치 1곳 → 상세(캠페인+후기 탭) 오픈 + 핀 선택.
    // 종료(비활성) 매장은 회색핀이 뜨는 줌까지 확대해 핀도 선택되게 하고, 상세는 후기 탭 기본.
    clearSearchPin();
    const p = placeMatches[0];
    const ended = getActiveCampaigns(p.id).length === 0;
    focusPlace(p.id, ended ? GRAY_PIN_MIN_ZOOM : 16);
    return;
  }
  if (placeMatches.length > 1) {
    // 같은 이름 매장이 여러 곳(예: '온담' 서울·인천) → 주소가 적힌 선택 목록 팝업
    showPlacePicker(placeMatches, query);
    return;
  }

  // 2. 주소/지역명 검색 (geocode)
  function trySearch(q, fallback) {
    naver.maps.Service.geocode({ query: q }, function(status, response) {
      const items = response?.v2?.addresses;
      if (status === naver.maps.Service.Status.OK && items?.length) {
        map.setCenter(new naver.maps.LatLng(parseFloat(items[0].y), parseFloat(items[0].x)));
        map.setZoom(15);
        showSearchPin(parseFloat(items[0].y), parseFloat(items[0].x));
      } else if (fallback) {
        trySearch(fallback, null);
      } else {
        // 3. 역명 등 POI는 geocode로 안 잡히는 경우가 많아 네이버 지역검색으로 폴백
        searchRegionViaLocalSearch(query);
      }
    });
  }

  const alreadyPrefixed = /^서울|^경기|^인천|^부산|^대구|^광주|^대전/.test(query);
  trySearch(query, alreadyPrefixed ? null : '서울 ' + query);
}

// 같은 이름 매장이 여러 곳일 때 주소로 구분해 고르는 선택 팝업
function showPlacePicker(matches, query) {
  const list = document.getElementById('placePickerList');
  const titleEl = document.getElementById('placePickerTitle');
  if (!list || !titleEl) return;
  titleEl.textContent = `'${query}' ${matches.length}곳`;
  list.innerHTML = matches.map(p => {
    const active = getActiveCampaigns(p.id).length;
    const badge = active > 0 ? `<span class="place-picker-badge">협찬 ${active}</span>` : '<span class="place-picker-badge ended">모집 없음</span>';
    return `<button class="place-picker-item" onclick="pickSearchedPlace(${p.id})">
        <span class="place-picker-item-top"><span class="place-picker-name">${p.name}</span>${badge}</span>
        <span class="place-picker-addr">${p.address || ''}</span>
      </button>`;
  }).join('');
  document.getElementById('placePickerOverlay').classList.add('show');
}

function closePlacePicker() {
  document.getElementById('placePickerOverlay').classList.remove('show');
}

function pickSearchedPlace(id) {
  closePlacePicker();
  const p = places.find(x => x.id === id);
  if (!p) return;
  clearSearchPin();
  const ended = getActiveCampaigns(p.id).length === 0;
  focusPlace(p.id, ended ? GRAY_PIN_MIN_ZOOM : 16);
}

async function searchRegionViaLocalSearch(query) {
  try {
    const res = await fetch('/api/search-place?query=' + encodeURIComponent(query));
    const items = res.ok ? await res.json() : [];
    if (!items.length) {
      showToast('검색 결과가 없어요.<br>주소로 검색해보세요 (예: 강남구, 성수동)');
      return;
    }
    const addr = items[0].roadAddress || items[0].address;
    naver.maps.Service.geocode({ query: addr }, function(status, response) {
      const item = response?.v2?.addresses?.[0];
      if (status === naver.maps.Service.Status.OK && item) {
        map.setCenter(new naver.maps.LatLng(parseFloat(item.y), parseFloat(item.x)));
        map.setZoom(15);
        showSearchPin(parseFloat(item.y), parseFloat(item.x));
      } else {
        showToast('검색 결과가 없어요.<br>주소로 검색해보세요 (예: 강남구, 성수동)');
      }
    });
  } catch (e) {
    showToast('검색 결과가 없어요.<br>주소로 검색해보세요 (예: 강남구, 성수동)');
  }
}

function searchRegionMobile() {
  const el = document.getElementById('regionSearchMobile');
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
}

function searchRegionMobileTop() {
  const el = document.getElementById('regionSearchMobileTop');
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
  el.blur();
}

function searchRegionMobileOverlay() {
  const el = document.getElementById('regionSearchMobileOverlay');
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
  el.blur();
  setTimeout(() => el.blur(), 0);
}

// 네이버 로고 표시/숨김
function setNaverLogoVisible(visible) {
  const logo = document.querySelector('#map .naver_logo, #map [class*="logo"]');
  if (logo) logo.style.visibility = visible ? '' : 'hidden';
}

// ===== 바텀시트 토글 (모바일) =====
let _sidebarSwipeAt = 0; // 스와이프로 열고/닫은 시각. 직후(~350ms) 따라오는 click만 무시

// 접힘 → 펼침 (스와이프 업 / 필요 시 재사용). 탭 펼치기와 동일 동작
function expandSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth > 640 || sidebar.classList.contains('expanded')) return;
  sidebar.style.transform = ''; sidebar.style.transition = '';
  sidebar.classList.add('expanded');
  // 닫힘 페이드가 도중이었을 수 있으니 리스트 불투명도 복원
  const listEl = document.getElementById('campaignList');
  if (listEl) { listEl.style.transition = ''; listEl.style.opacity = ''; }
  const arrow = document.getElementById('sidebarArrow');
  if (arrow) arrow.textContent = '﹀';
  setNaverLogoVisible(false);
  renderSidebar();
  setTimeout(updateSidebarListFade, 400);
}

function toggleBottomSheet(e) {
  if (window.innerWidth > 640) return;
  if (Date.now() - _sidebarSwipeAt < 350) return; // 스와이프 직후 따라온 click → 탭 무시
  const sidebar = document.getElementById('sidebar');
  // 헤더 영역 클릭 시에만 토글 (리스트 스크롤은 방해 안 함)
  if (e.target.closest('.sidebar-list') || e.target.closest('.sidebar-card')) return;
  const willExpand = !sidebar.classList.contains('expanded');
  // 스와이프 dismiss 후 남아있는 inline transform 초기화
  if (willExpand) { sidebar.style.transform = ''; sidebar.style.transition = ''; }
  sidebar.classList.toggle('expanded');
  if (!willExpand) {
    sidebar.classList.remove('expanded-full');
    setTimeout(() => {
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
    }, 350);
  }
  const isExpanded = sidebar.classList.contains('expanded');
  // 화살표 방향 전환 (닫힘: ︿ 위방향 → 열림: ﹀ 아래방향)
  const arrow = document.getElementById('sidebarArrow');
  if (arrow) arrow.textContent = isExpanded ? '﹀' : '︿';
  setNaverLogoVisible(!isExpanded);
  if (isExpanded) renderSidebar();
  setTimeout(updateSidebarListFade, 400); // 높이 트랜지션(0.35s) 후 페이드 재계산
}

// 리스트 스크롤 시 바텀시트 높이 자동 확장/축소
function initSidebarScrollExpand() {
  const list = document.getElementById('campaignList');
  if (!list) return;
  list.addEventListener('scroll', () => {
    updateSidebarListFade();
    if (window.innerWidth > 640) return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('expanded')) return;
    // 한번 full 확장되면 닫기 전까지 유지 (scrollTop=0 돼도 축소 안 함)
    if (list.scrollTop > 10) {
      sidebar.classList.add('expanded-full');
    }
  }, { passive: true });
}

// ===== 매장 검색 (장소명 → 기존 등록 + 네이버 검색 통합) =====
let modalSelectedResultKey = null;
let lastNaverResults = [];
let lastSearchQuery = '';
let placeResultsVisibleCount = 10;
const PLACE_RESULTS_PAGE_SIZE = 10;

function renderActivePlaceCampaigns(placeId) {
  const today = getKSTTodayUTC();
  const active = campaigns.filter(c => c.placeId === placeId && !c.hidden && deadlineToUTC(c.deadline) >= today);
  if (!active.length) {
    return '<div class="place-campaign-preview"><div class="place-campaign-preview-empty">현재 진행중인 협찬이 없어요. 새 협찬을 등록해주세요.</div></div>';
  }
  const itemsHtml = active.map(c => {
    const color = getPlatformColor(c.platform);
    return `
      <div class="place-campaign-preview-item">
        <span class="place-campaign-tag" style="background:${color}29;color:${color}">${c.platform}</span>
        <span class="place-campaign-content">${c.content}</span>
      </div>`;
  }).join('');
  return `
    <div class="place-campaign-preview">
      <div class="place-campaign-preview-label">진행중인 협찬 ${active.length}건</div>
      <div class="place-campaign-preview-items">${itemsHtml}</div>
    </div>`;
}

function searchPlaceUnified() {
  const q = document.getElementById('inputName').value.trim();
  const listEl = document.getElementById('placeResultsList');
  if (!q) { showFieldError('inputName'); return; }
  clearFieldError('inputName');
  document.getElementById('inputName').blur();

  modalSelectedPlaceId = null;
  modalIsNewPlace = true;
  modalSelectedAddress = ''; modalSelectedLat = null; modalSelectedLng = null;
  modalSelectedResultKey = null;
  lastNaverResults = [];
  lastSearchQuery = q;
  placeResultsVisibleCount = PLACE_RESULTS_PAGE_SIZE;

  listEl.innerHTML = '<div class="search-hint">검색 중...</div>';

  fetch('/api/search-place?query=' + encodeURIComponent(q))
    .then(res => res.ok ? res.json() : [])
    .catch(() => [])
    .then(items => {
      lastNaverResults = items;
      renderPlaceResults();
    });
}

function loadMorePlaceResults() {
  placeResultsVisibleCount += PLACE_RESULTS_PAGE_SIZE;
  renderPlaceResults();
}

function renderPlaceResults() {
  const listEl = document.getElementById('placeResultsList');
  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(lastSearchQuery);
  const existingMatches = places.filter(p => {
    const np = normalize(p.name);
    return np.includes(nq) || nq.includes(np);
  });

  const combined = [
    ...existingMatches.map(p => ({ type: 'existing', place: p })),
    ...lastNaverResults.map((item, i) => ({ type: 'naver', item, index: i }))
  ];
  const visibleEntries = combined.slice(0, placeResultsVisibleCount);

  const rowsHtml = visibleEntries.map(entry => {
    if (entry.type === 'existing') {
      const p = entry.place;
      const key = `existing:${p.id}`;
      const selected = modalSelectedResultKey === key;
      const rowHtml = `
        <div class="place-result-item ${selected ? 'selected' : ''}" onclick="selectExistingPlace(${p.id})">
          <div class="place-result-info">
            <div class="place-result-name">${p.name}</div>
            <div class="place-result-addr">${p.address}</div>
          </div>
          <span class="place-result-check ${selected ? 'selected' : ''}">✓</span>
        </div>`;
      return selected ? rowHtml + renderActivePlaceCampaigns(p.id) : rowHtml;
    }
    const { item, index } = entry;
    const key = `naver:${index}`;
    const selected = modalSelectedResultKey === key;
    const addr = (item.roadAddress || item.address).replace(/'/g, "\\'");
    const name = item.name.replace(/'/g, "\\'");
    return `
      <div class="place-result-item ${selected ? 'selected' : ''}" onclick="selectNaverPlace(${index}, '${name}', '${addr}')">
        <div class="place-result-info">
          <div class="place-result-name">${item.name}</div>
          <div class="place-result-addr">${item.roadAddress || item.address}</div>
        </div>
        <span class="place-result-check ${selected ? 'selected' : ''}">✓</span>
      </div>`;
  }).join('');

  if (!rowsHtml) {
    listEl.innerHTML = '<div class="search-hint error">검색 결과가 없어요. 매장명을 다시 확인해주세요.</div>';
    fixIosScrollReflow();
    return;
  }
  const moreButtonHtml = combined.length > placeResultsVisibleCount
    ? `<div class="place-result-more-wrap"><div class="place-result-more" onclick="loadMorePlaceResults()">더보기</div></div>`
    : '';
  listEl.innerHTML = rowsHtml + moreButtonHtml;
  fixIosScrollReflow();
}

// iOS Safari: -webkit-overflow-scrolling:touch 컨테이너에 동적으로 콘텐츠를
// 주입하면 스크롤 가능 영역이 재계산되지 않아 터치 스크롤이 안 먹는 버그 우회
function fixIosScrollReflow() {
  const body = document.getElementById('step1Body');
  if (!body) return;
  body.style.webkitOverflowScrolling = 'auto';
  requestAnimationFrame(() => { body.style.webkitOverflowScrolling = 'touch'; });
}

function selectExistingPlace(placeId) {
  const place = places.find(p => p.id === placeId);
  if (!place) return;
  const key = `existing:${placeId}`;

  if (modalSelectedResultKey === key) {
    modalSelectedPlaceId = null;
    modalIsNewPlace = true;
    modalSelectedAddress = ''; modalSelectedLat = null; modalSelectedLng = null;
    modalSelectedResultKey = null;
    renderPlaceResults();
    return;
  }

  modalSelectedPlaceId = placeId;
  modalIsNewPlace = false;
  modalSelectedAddress = place.address;
  modalSelectedLat = place.lat;
  modalSelectedLng = place.lng;
  modalSelectedResultKey = key;
  document.getElementById('inputName').value = place.name;
  clearFieldError('inputName');
  renderPlaceResults();
}

function isSimilarPlaceName(a, b) {
  const na = String(a || '').replace(/\s/g, '').toLowerCase();
  const nb = String(b || '').replace(/\s/g, '').toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function selectNaverPlace(index, name, address) {
  const key = `naver:${index}`;

  if (modalSelectedResultKey === key) {
    modalSelectedPlaceId = null;
    modalIsNewPlace = true;
    modalSelectedAddress = ''; modalSelectedLat = null; modalSelectedLng = null;
    modalSelectedResultKey = null;
    renderPlaceResults();
    return;
  }

  document.getElementById('inputName').value = name;
  clearFieldError('inputName');

  naver.maps.Service.geocode({ query: address }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK || !response.v2.addresses?.length) {
      showToast('주소를 확인할 수 없어요. 다른 매장을 선택해주세요.');
      return;
    }
    const item = response.v2.addresses[0];
    const finalAddr = item.roadAddress || item.jibunAddress;
    const lat = parseFloat(item.y), lng = parseFloat(item.x);

    // 가까운 좌표(50m 이내) + 매장명까지 비슷해야 같은 장소로 판단
    // (코엑스/백화점처럼 한 건물에 여러 매장이 있으면 주소 geocoding이 건물 단위로 뭉쳐서 좌표만으론 구분 불가)
    const sameAddr = places.find(p => {
      const dLat = (p.lat - lat) * 111000;
      const dLng = (p.lng - lng) * 88000;
      const closeEnough = Math.sqrt(dLat * dLat + dLng * dLng) < 50;
      return closeEnough && isSimilarPlaceName(p.name, name);
    });
    if (sameAddr) {
      selectExistingPlace(sameAddr.id);
      showToast(`이미 등록된 장소예요: ${sameAddr.name}`);
      return;
    }

    modalSelectedPlaceId = null;
    modalIsNewPlace = true;
    modalSelectedAddress = finalAddr;
    modalSelectedLat = lat;
    modalSelectedLng = lng;
    modalSelectedResultKey = key;
    renderPlaceResults();
  });
}

// ===== 개인정보처리방침 / 이용약관 =====
const POLICY_CONTENT = {
  privacy: {
    title: '개인정보처리방침',
    body: `
      <p>무협맵(이하 '서비스')은 「개인정보 보호법」 및 「위치정보의 보호 및 이용 등에 관한 법률」을 준수하며, 이용자의 개인정보를 보호하기 위해 다음과 같이 처리방침을 둡니다. 본 방침은 서비스의 웹 및 모바일 앱(App Store 등을 통해 배포되는 iOS 등 앱)에 동일하게 적용됩니다.</p>
      <div class="about-section">
        <div class="about-section-title">1. 수집하는 개인정보 항목</div>
        <p class="about-desc">서비스는 필요한 최소한의 정보만 수집합니다.</p>
        <p class="about-desc">· 간편로그인 시(카카오·네이버): 소셜 계정 식별자, 닉네임, 이메일<br>
        · 프로필 등록 시: 블로그·인스타그램 주소<br>
        · 협찬 제보·신고 시: 닉네임, 블로그·인스타그램 링크 (로그인 사용자는 가입 시 이메일이 연계됨)<br>
        · 후기 등록 시: 네이버 블로그 게시글 URL, 블로그 필명, 게시물 제목·썸네일·발췌·게시일, 후기 좋아요 기록<br>
        · 위치정보: 이용자 단말기의 현재 위치 ('내 주변 협찬' 표시 목적)<br>
        · 자동 수집: 접속 IP, 서비스 이용기록(협찬 조회·외부 링크 클릭)<br>
        · 이벤트 운영 시: 당첨자 휴대전화번호(경품 발송 목적)</p>
        <p class="about-desc">※ 비회원도 제보할 수 있으며, 이 경우 이메일은 수집하지 않습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">2. 수집 및 이용 목적</div>
        <p class="about-desc">회원 식별 및 서비스 제공, 제보·신고·후기 내용 확인 및 노출·운영, 부정 이용 방지, 통계 분석을 통한 서비스 개선, 이벤트·참여 기회 제공 및 경품 발송(해당 시)을 위해 이용합니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">3. 위치정보의 처리</div>
        <p class="about-desc">'내 주변 협찬' 표시를 위해 단말기의 현재 위치를 일회성으로 이용하며, 해당 위치정보는 서버에 저장하지 않습니다. 이용자는 브라우저·기기 설정에서 위치 권한을 거부할 수 있고, 거부 시 내 주변 관련 기능만 제한됩니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">4. 보유 및 이용 기간</div>
        <p class="about-desc">· 회원 정보: 회원 탈퇴 시 지체 없이 파기<br>
        · 제보·신고 내용: 서비스 운영을 위해 보관하되, 탈퇴 시 작성자 계정과의 연결을 해제(닉네임 표기만 유지)<br>
        · 후기: 서비스 노출을 위해 보관하되, 이용자가 직접 삭제하거나 탈퇴 시 작성자 계정과의 연결을 해제<br>
        · 접속기록·IP·이용기록: 부정 이용 방지 및 통계 목적으로 1년간 보관 후 파기<br>
        · 위치정보: 저장하지 않음<br>
        · 이벤트 당첨자 연락처: 경품 발송 완료 후 즉시 파기<br>
        · 단, 관계 법령상 보존 의무가 있는 경우 해당 기간 동안 보관</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">5. 제3자 제공 및 처리위탁</div>
        <p class="about-desc">서비스는 원칙적으로 개인정보를 외부에 제공하지 않습니다. 간편로그인은 카카오·네이버 인증을 이용하며 해당 사업자의 개인정보 처리에는 각 사의 방침이 적용됩니다. 또한 서비스 운영을 위해 클라우드 인프라(Vercel, Turso 등)에 데이터가 저장·처리될 수 있습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">6. 외부 링크에 대한 책임</div>
        <p class="about-desc">서비스에 게시된 블로그·인스타그램 등 외부 링크는 외부 사이트로 연결됩니다. 외부 사이트의 콘텐츠 및 개인정보 처리에는 본 방침이 적용되지 않으며, 이에 대해 서비스는 책임지지 않습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">7. 이용자의 권리</div>
        <p class="about-desc">이용자는 언제든 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있으며, 회원 탈퇴를 통해 직접 삭제할 수 있습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">8. 개인정보 보호책임자</div>
        <p class="about-desc">개인정보 보호책임자: 무협맵 운영팀. 개인정보 관련 문의 및 권리 행사는 서비스 내 안내 채널을 통해 접수할 수 있습니다. (정식 오픈 시 책임자 성명·연락처를 기재합니다.)</p>
      </div>
      <div class="about-legal">
        <p>본 방침은 운영상·법령상 필요에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다.</p>
      </div>`
  },
  terms: {
    title: '이용약관',
    body: `
      <div class="about-section">
        <div class="about-section-title">제1조 (목적)</div>
        <p class="about-desc">본 약관은 무협맵(이하 '서비스')이 제공하는 협찬 정보 탐색 서비스의 이용 조건 및 절차를 규정함을 목적으로 합니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제2조 (서비스의 성격)</div>
        <p class="about-desc">서비스는 여러 플랫폼에 흩어진 협찬 정보를 지도 위에서 탐색할 수 있도록 돕는 정보 제공 서비스이며, 협찬의 신청·진행·이행에 직접 관여하지 않습니다. 서비스는 웹 및 모바일 앱(App Store 등을 통해 배포되는 iOS 등 앱) 형태로 제공되며, 별도로 정하지 않는 한 본 약관이 동일하게 적용됩니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제3조 (위치기반 서비스)</div>
        <p class="about-desc">서비스는 '내 주변 협찬' 등 위치기반 기능을 제공합니다. 위치정보는 이용자 단말기에서 일회성으로 이용되며 서버에 저장되지 않고, 이용자는 기기 설정에서 위치 권한을 거부할 수 있습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제4조 (이용자의 의무)</div>
        <p class="about-desc">이용자는 협찬 정보 제보 시 사실에 기반한 정확한 정보를 등록해야 하며, 허위 정보 등록 시 서비스 이용이 제한될 수 있습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제5조 (게시물·후기 및 외부 링크)</div>
        <p class="about-desc">서비스에 게시된 협찬 정보는 이용자의 제보를 기반으로 합니다. 또한 이용자는 방문 후기를 자신이 작성한 네이버 블로그 등 외부 게시물의 링크·요약(제목·썸네일·발췌) 형태로 등록할 수 있으며, 후기의 내용·저작권에 대한 책임은 작성자에게 있습니다. 게시물·후기에 포함된 블로그·인스타그램 등 외부 링크는 외부 사이트로 연결되며, 외부 사이트의 콘텐츠·운영에 대해 서비스는 책임지지 않습니다. 서비스는 허위·부적절하거나 타인의 권리를 침해하는 게시물·후기를 사전 통지 없이 숨김 또는 삭제할 수 있습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제6조 (이벤트 및 보상)</div>
        <p class="about-desc">서비스는 제보왕·포인트 등 이벤트 및 보상 제도를 운영할 수 있으며, 세부 기준은 운영정책 또는 별도 공지에 따릅니다. 허위·부정 제보는 보상에서 제외·차감될 수 있습니다. 경품 수령 등은 이용자 본인 계정을 통해서만 확인하며, 서비스는 외부 연락을 통한 개인정보·금전 요구를 하지 않으니 사칭에 유의하시기 바랍니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제7조 (책임의 제한)</div>
        <p class="about-desc">서비스에 게시된 협찬 정보의 정확성·최신성에 대해 서비스는 보증하지 않으며, 협찬 신청 및 진행과 관련한 권리와 책임은 각 플랫폼 및 업체에 있습니다.</p>
      </div>
      <div class="about-legal">
        <p>본 약관은 서비스 운영상 필요에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다.</p>
      </div>`
  }
};

function openPolicy(type) {
  const data = POLICY_CONTENT[type];
  if (!data) return;
  document.getElementById('policyTitle').textContent = data.title;        // PC 정적 헤더
  document.getElementById('policyStickyTitle').textContent = data.title;  // 모바일 스크롤 시 sticky 헤더
  document.getElementById('policyStickyHeader').classList.remove('show');
  const body = document.getElementById('policyBody');
  // 모바일: 제보하기처럼 큰 타이틀(scroll-header)이 본문 위에서 스크롤되어 사라지고 sticky가 등장
  body.innerHTML = `<div class="modal-scroll-header" id="policyScrollHeader"><h2>${data.title}</h2></div>` + data.body;
  const ov = document.getElementById('policyOverlay');
  ov.classList.add('open');
  void ov.offsetHeight;   // display:none→flex 반영 후에 리셋해야 브라우저의 스크롤 복원을 막음
  body.scrollTop = 0;
  bindMobileScrollHeader('policyBody', 'policyScrollHeader', 'policyStickyHeader');
}
function closePolicy() {
  document.getElementById('policyOverlay').classList.remove('open');
  resetModalScroll('policyOverlay');
}

// ===== 우측 슬라이드 메뉴 =====
function openSideMenu() {
  document.getElementById('sideMenuOverlay').classList.add('open');
}
function closeSideMenu() {
  document.getElementById('sideMenuOverlay').classList.remove('open');
}

// ===== 간편로그인 =====
let currentUser = null;

async function refreshAuthUI() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    currentUser = data.user || null;
  } catch (e) {
    currentUser = null;
  }
  const loggedIn = !!currentUser;
  // PC 하단 MY 영역 (로그인 전: 간편로그인 안내 / 로그인 후: 아바타+닉네임+로그아웃)
  const pcMyGuest = document.getElementById('pcNavMyGuest');
  const pcMyUser = document.getElementById('pcNavMyUser');
  const pcMyName = document.getElementById('pcNavMyName');
  if (pcMyGuest) pcMyGuest.style.display = loggedIn ? 'none' : 'flex';
  if (pcMyUser) pcMyUser.style.display = loggedIn ? 'flex' : 'none';
  if (pcMyName && loggedIn) {
    const nick = currentUser.nickname || '';
    const shown = nick.length >= 4 ? nick.slice(0, 3) + '...' : nick;
    pcMyName.textContent = `${shown}님`;
  }
  // 모바일 사이드 메뉴
  const sideLoginCard = document.getElementById('sideMenuLoginCard');
  const sideUser = document.getElementById('sideMenuUser');
  if (sideLoginCard) sideLoginCard.style.display = loggedIn ? 'none' : '';
  if (sideUser) sideUser.style.display = loggedIn ? 'flex' : 'none';
  if (loggedIn) {
    const sideName = document.getElementById('sideMenuUserName');
    if (sideName) sideName.textContent = currentUser.nickname || '';
    const sideProviderIcon = document.getElementById('sideMenuProviderIcon');
    if (sideProviderIcon) {
      sideProviderIcon.src = providerIconSrc(currentUser.provider);
    }
  }
  // 내 정보 패널이 열려 있으면 로그인 상태 변화 반영
  if (document.body.classList.contains('pc-myinfo-mode')) openMyInfoPanel();
}

// 로그인 provider별 아이콘 (카카오/네이버/애플) — 닉네임 앞 표시용
function providerIconSrc(provider) {
  if (provider === 'kakao') return 'image/ic_login_kakao_16.svg';
  if (provider === 'apple') return 'image/ic_login_apple_16.svg';
  return 'image/ic_login_naver_16.svg';
}

function openLoginSheet() {
  // Apple 로그인 버튼은 네이티브 iOS 앱(+플러그인)에서만 노출. 웹은 카카오/네이버만.
  const appleBtn = document.getElementById('loginAppleBtn');
  if (appleBtn) {
    const canApple = isNativeApp() && !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SignInWithApple);
    appleBtn.style.display = canApple ? 'flex' : 'none';
  }
  document.getElementById('loginOverlay').classList.add('open');
}

// Apple 네이티브 로그인: 플러그인으로 identityToken 받아 서버 검증 → 로그인
async function appleSignIn() {
  const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SignInWithApple;
  if (!plugin) { showAlert('Apple 로그인', '앱에서만 사용할 수 있어요.'); return; }
  try {
    const result = await plugin.authorize({
      clientId: 'com.muhyeop.app',
      redirectURI: 'https://muhyeop.com/api/auth/callback',
      scopes: 'email name'
    });
    const r = (result && result.response) || result || {};
    const identityToken = r.identityToken;
    if (!identityToken) { showAlert('Apple 로그인 실패', '다시 시도해주세요.'); return; }
    const nickname = [r.givenName, r.familyName].filter(Boolean).join('');
    const resp = await fetch('/api/auth/callback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'apple', identityToken, nickname })
    }).then(x => x.json());
    if (resp && resp.ok) {
      const url = new URL(window.location.href);
      if (resp.isNewUser) url.searchParams.set('signup', '1');
      window.location.href = url.toString();  // OAuth 리다이렉트처럼 새로고침해 로그인 반영
    } else {
      showAlert('Apple 로그인 실패', '다시 시도해주세요.');
    }
  } catch (e) {
    // 사용자가 취소한 경우 등은 조용히 무시
  }
}
function closeLoginSheet() {
  document.getElementById('loginOverlay').classList.remove('open');
}

// 이메일 형식 검증 (빈 값은 선택이라 호출 전에 분기)
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function openSignupInfoSheet() {
  // 한 번 노출하면 자동으로 다시 띄우지 않음 (건너뛰면 '내 정보'에서 직접 등록)
  try { localStorage.setItem('snsRegisterPrompted', '1'); } catch (e) {}
  // 네이버는 OAuth 이메일을 미리 채워서 보여주고, 카카오는 빈 칸(직접 입력)
  document.getElementById('signupEmail').value = currentUser?.email || '';
  document.getElementById('signupUrlPlatform').value = '';
  syncSelectTrigger('signupUrlPlatform');
  updateUrlPlatform('', 'signup');
  document.getElementById('signupUrlId').value = '';
  document.getElementById('signupInfoOverlay').classList.add('open');
}
function closeSignupInfoSheet() {
  document.getElementById('signupInfoOverlay').classList.remove('open');
}
function skipSignupInfo() {
  closeSignupInfoSheet();
  openSignupDone();
}
async function confirmSignupInfo() {
  const urlPlatform = document.getElementById('signupUrlPlatform').value;
  const urlId = document.getElementById('signupUrlId').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  if (email && !isValidEmail(email)) { showAlert('이메일을 확인해주세요', '올바른 이메일 형식을 입력해주세요.'); return; }
  if ((urlPlatform && urlId) || email) {
    try {
      await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlPlatform, urlId, email })
      });
      await refreshAuthUI();
    } catch (e) {}
  }
  closeSignupInfoSheet();
  openSignupDone();
}
function openSignupDone() {
  document.getElementById('signupDoneOverlay').classList.add('open');
}
function closeSignupDone() {
  document.getElementById('signupDoneOverlay').classList.remove('open');
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  refreshAuthUI();
  // 제보 모달이 열려 있으면 '내 이름 남기기'를 즉시 비로그인 상태로 갱신
  const modalOpen = document.getElementById('modalOverlay');
  if (modalOpen && (modalOpen.classList.contains('open') || modalOpen.classList.contains('show'))) {
    syncFounderSection();
  }
}

function formatJoinDate(raw) {
  if (!raw) return '-';
  const d = new Date(String(raw).replace(' ', 'T') + (String(raw).includes('T') || String(raw).length <= 10 ? '' : 'Z'));
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

// 로그인 사용자의 내 정보 필드 채우기 (로그인 전/후 공용)
function populateProfileFields() {
  if (!currentUser) return;
  const icon = document.getElementById('myinfoProviderIcon');
  if (icon) icon.src = providerIconSrc(currentUser.provider);
  const nick = document.getElementById('myinfoNick');
  if (nick) nick.textContent = currentUser.nickname || '';
  const joined = document.getElementById('myinfoJoined');
  if (joined) joined.textContent = formatJoinDate(currentUser.createdAt);
  const setStat = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = Number(v || 0).toLocaleString(); };
  setStat('myinfoVisitCount', currentUser.visitCount);
  setStat('myinfoReportCount', currentUser.reportCount);
  setStat('myinfoReviewCount', currentUser.reviewCount);
  setStat('myinfoHelpfulCount', currentUser.helpfulCount);
  const emailEl = document.getElementById('profileEmail');
  if (emailEl) emailEl.value = currentUser.email || '';
  const sel = document.getElementById('profileUrlPlatform');
  sel.value = currentUser.urlPlatform || '';
  syncSelectTrigger('profileUrlPlatform');
  updateUrlPlatform(currentUser.urlPlatform || '', 'profile', true);
  document.getElementById('profileUrlId').value = currentUser.urlId || '';
}
// 로그인 전/후 뷰 토글
function showProfileMode(mode) {
  const inEl = document.getElementById('profileLoggedIn');
  const outEl = document.getElementById('profileLoggedOut');
  if (inEl) inEl.style.display = mode === 'in' ? '' : 'none';
  if (outEl) outEl.style.display = mode === 'out' ? '' : 'none';
}

// 모바일 내 정보 바텀시트 (비로그인 시 로그인 시트로 우회)
// PC에서는 좌측 "내 정보" 탭 패널로 라우팅
function openProfileSheet() {
  if (window.innerWidth > 640) { switchPcTab('myinfo'); return; }
  if (!currentUser) { openLoginSheet(); return; }
  showProfileMode('in');
  populateProfileFields();
  syncMobileModalHeader('#profileOverlay');
  bindMobileScrollHeader('profileBody', 'profileScrollHeader', 'profileStickyHeader');
  document.getElementById('profileStickyHeader').classList.remove('show');
  const pBody = document.getElementById('profileBody');
  if (pBody) pBody.scrollTop = 0;
  document.getElementById('profileOverlay').classList.add('open');
}

// PC 좌측 "내 정보" 패널 (로그인 전: 로그인 유도 / 로그인 후: 내 정보)
function openMyInfoPanel() {
  const loggedIn = !!currentUser;
  showProfileMode(loggedIn ? 'in' : 'out');
  if (loggedIn) populateProfileFields();
  const pBody = document.getElementById('profileBody');
  if (pBody) pBody.scrollTop = 0;
  document.getElementById('profileOverlay').classList.add('open');
}
function closeProfileSheet() {
  document.getElementById('profileOverlay').classList.remove('open');
  resetModalScroll('profileOverlay');
}

// 버튼 안에 로딩 로티(흰 점 3개, 후기 로딩과 동일 애니)를 넣고 텍스트를 숨김. 완료 시 복원.
function setButtonLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    if (btn.dataset.loading === '1') return;
    btn.dataset.loading = '1';
    btn.disabled = true;
    btn.classList.add('btn-loading');
    const c = document.createElement('span');
    c.className = 'btn-lottie';
    btn.appendChild(c);
    if (window.lottie) {
      btn._lottieAnim = window.lottie.loadAnimation({
        container: c, renderer: 'svg', loop: true, autoplay: true,
        path: 'image/loading-review.json'
      });
    }
  } else {
    if (btn.dataset.loading !== '1') return;
    btn.dataset.loading = '';
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    if (btn._lottieAnim) { try { btn._lottieAnim.destroy(); } catch (e) {} btn._lottieAnim = null; }
    const c = btn.querySelector('.btn-lottie');
    if (c) c.remove();
  }
}

async function saveProfile() {
  const urlPlatform = document.getElementById('profileUrlPlatform').value;
  const urlId = document.getElementById('profileUrlId').value.trim();
  const email = document.getElementById('profileEmail')?.value.trim() || '';
  if (email && !isValidEmail(email)) { showAlert('이메일을 확인해주세요', '올바른 이메일 형식을 입력해주세요.'); return; }
  const btn = document.querySelector('#profileOverlay .btn-submit');
  setButtonLoading(btn, true);
  try {
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlPlatform, urlId, email })
    });
    if (!res.ok) { showAlert('저장 중 오류가 발생했어요.', '잠시 후 다시 시도해주세요.'); return; }
    await refreshAuthUI();
    // PC 내 정보 패널 모드에서는 패널을 닫지 않고 유지 (refreshAuthUI가 갱신)
    if (!document.body.classList.contains('pc-myinfo-mode')) closeProfileSheet();
    showToast('프로필을 저장했어요.');
  } catch (e) {
    showAlert('저장 중 오류가 발생했어요.', '잠시 후 다시 시도해주세요.');
  } finally {
    setButtonLoading(btn, false);
  }
}

function deleteAccount() {
  openWithdrawConfirm();
}

function openWithdrawConfirm() {
  document.getElementById('withdrawConfirmOverlay').classList.add('open');
}
function closeWithdrawConfirm() {
  document.getElementById('withdrawConfirmOverlay').classList.remove('open');
}

let _withdrawing = false;
async function confirmWithdraw() {
  if (_withdrawing) return;
  _withdrawing = true;
  try {
    const res = await fetch('/api/auth/delete-account', { method: 'POST' });
    if (!res.ok) {
      closeWithdrawConfirm();
      showToast('탈퇴 처리 중 오류가 발생했어요. 다시 시도해주세요.');
      return;
    }
    currentUser = null;
    refreshAuthUI();
    closeWithdrawConfirm();
    document.getElementById('withdrawDoneOverlay').classList.add('open');
  } catch (e) {
    closeWithdrawConfirm();
    showToast('탈퇴 처리 중 오류가 발생했어요. 다시 시도해주세요.');
  } finally {
    _withdrawing = false;
  }
}

function finishWithdraw() {
  document.getElementById('withdrawDoneOverlay').classList.remove('open');
  location.href = '/';
}

// ===== 공통 알림 팝업 (PC 중앙 카드 / 모바일 바텀시트) =====
let _alertOnConfirm = null;
function showAlert(main, sub, opts) {
  opts = opts || {};
  document.getElementById('alertPopupMain').textContent = main || '';
  document.getElementById('alertPopupSub').textContent = sub || '';
  const cancel = document.getElementById('alertPopupCancel');
  const confirmBtn = document.getElementById('alertPopupConfirm');
  cancel.style.display = opts.twoButton ? '' : 'none';
  cancel.textContent = opts.cancelText || '취소';
  confirmBtn.textContent = opts.confirmText || '확인';
  _alertOnConfirm = opts.onConfirm || null;
  document.getElementById('alertPopupOverlay').classList.add('open');
}
function closeAlertPopup() {
  document.getElementById('alertPopupOverlay').classList.remove('open');
  _alertOnConfirm = null;
}
function alertPopupConfirm() {
  const cb = _alertOnConfirm;
  document.getElementById('alertPopupOverlay').classList.remove('open');
  _alertOnConfirm = null;
  if (cb) cb();
}

// ===== 모달 =====
function openAbout() {
  if (window.innerWidth > 640) {
    switchPcTab('about');
    return;
  }
  document.getElementById('aboutOverlay').classList.add('open');
}
function closeAbout() {
  document.getElementById('aboutOverlay').classList.remove('open');
  resetModalScroll('aboutOverlay');
  if (window.innerWidth > 640 && pcTabActive === 'about') {
    switchPcTab('campaigns');
  }
}

// ===== 신고 모달 =====
let reportTargetType = 'campaign';      // 'place' | 'campaign' | 'review'
let reportSelectedId = null;            // 선택된 대상 id (타입별: place/campaign/review)
let reportSelectedPlaceId = null;       // review 타입에서 후기 목록을 불러올 매장 선택용
let _reportReviews = [];                // review 타입: 선택 매장의 후기 목록 캐시
let reportSelectedReason = null;
let reportContextPlaceId = null;        // 매장에서 신고 진입 시 그 매장 맥락 유지(대상 유형 고르면 이 매장으로 자동 스코프)

function openReportModal() {
  if (window.innerWidth > 640) {
    switchPcTab('reportissue');
    return;
  }
  resetReportModal();
  syncMobileModalHeader('#reportOverlay');
  bindMobileScrollHeader('reportBody', 'reportScrollHeader', 'reportStickyHeader');
  document.getElementById('reportOverlay').classList.add('open');
}
// 매장 단위 신고 진입점: 대상 유형은 '미선택'으로 열어 넘겨짚지 않고, 그 매장 맥락만 기억한다.
// 사용자가 대상(매장/캠페인/후기)을 고르면 applyReportContext()가 이 매장으로 자동 스코프한다.
function openReportModalForPlace(placeId) {
  openReportModal();            // resetReportModal 포함 → 대상 미선택 + 검색칸 빈 상태
  reportContextPlaceId = placeId;
}
function closeReportModal() {
  document.getElementById('reportOverlay').classList.remove('open');
  resetModalScroll('reportOverlay');
  if (window.innerWidth > 640 && pcTabActive === 'reportissue') {
    switchPcTab('campaigns');
  }
}
function resetReportModal() {
  reportSelectedId = null;
  reportSelectedPlaceId = null;
  _reportReviews = [];
  reportSelectedReason = null;
  reportContextPlaceId = null;
  setReportTargetType('campaign', false); // 기본 유형 캠페인(검색 즉시 작동)이되 트리거는 '선택하세요'
  document.getElementById('reportSearchInput').value = '';
  document.getElementById('reportResultsList').innerHTML = '';
  document.getElementById('reportDetail').value = '';
  document.getElementById('reportReasonSelect').selectedIndex = 0;
  syncSelectTrigger('reportReasonSelect');
  clearFieldError('reportTarget');
  clearFieldError('reportReason');
  document.querySelectorAll('#reportOverlay .btn-input-clear').forEach(b => b.classList.remove('show'));
  document.getElementById('reportStickyHeader').classList.remove('show');
  const reportBody = document.getElementById('reportBody');
  if (reportBody) reportBody.scrollTop = 0;
}

// 모바일 공통: 모달 body 스크롤 시 .modal-scroll-header가 사라지면 sticky 헤더 노출
function bindMobileScrollHeader(bodyId, scrollHeaderId, stickyHeaderId) {
  const body = document.getElementById(bodyId);
  const scrollHeader = document.getElementById(scrollHeaderId);
  const stickyHeader = document.getElementById(stickyHeaderId);
  if (!body || !scrollHeader || !stickyHeader) return;
  const handler = () => {
    if (window.innerWidth > 640) return;
    const threshold = scrollHeader.offsetTop + scrollHeader.offsetHeight;
    stickyHeader.classList.toggle('show', body.scrollTop > threshold);
  };
  if (body._mobileScrollHeaderHandler) {
    body.removeEventListener('scroll', body._mobileScrollHeaderHandler);
  }
  body._mobileScrollHeaderHandler = handler;
  body.addEventListener('scroll', handler, { passive: true });
}

// 모달 닫을 때 스크롤 위치 초기화(다음에 다시 열면 항상 맨 위부터). 페이드아웃 후 리셋해 닫히는 중 튐 방지.
function resetModalScroll(overlayId) {
  setTimeout(() => {
    const ov = document.getElementById(overlayId);
    if (!ov) return;
    ov.querySelectorAll('.modal-body, .signup-content, .detail-scroll').forEach(el => { el.scrollTop = 0; });
    ov.querySelectorAll('.modal-sticky-header').forEach(el => el.classList.remove('show'));
  }, 350);
}

// 모바일 공통: 정적 .modal-header는 모바일에서 숨기고 .modal-scroll-header로 대체
function syncMobileModalHeader(modalSelector) {
  const mh = document.querySelector(modalSelector + ' .modal-header');
  if (mh) mh.style.display = window.innerWidth <= 640 ? 'none' : 'flex';
}

// 대상 유형별 신고 이유
const REPORT_REASONS = {
  campaign: ['캠페인 정보 변경', '협찬 종료', '허위 정보', '기타'],
  place: ['폐업/운영 종료', '위치·정보 오류', '중복 등록', '기타'],
  review: ['허위·과장 후기', '광고/스팸', '부적절한 내용', '관련 없는 후기', '기타']
};
function populateReportReasons(type) {
  const sel = document.getElementById('reportReasonSelect');
  if (!sel) return;
  const reasons = REPORT_REASONS[type] || REPORT_REASONS.campaign;
  sel.innerHTML = '<option value="">선택하세요</option>' + reasons.map(r => `<option value="${r}">${r}</option>`).join('');
  sel.selectedIndex = 0;
  reportSelectedReason = null;
  syncSelectTrigger('reportReasonSelect');
  clearFieldError('reportReason');
}

// 신고 대상 유형 변경 (매장/캠페인/후기)
let reportTypeChosen = false; // 신고 대상 유형을 실제로 선택했는지(false면 트리거에 '선택하세요')
const REPORT_TYPE_LABEL = { place: '매장', campaign: '캠페인', review: '후기' };
function syncReportTypeTrigger() {
  const val = document.getElementById('reportTargetTypeSelectValue');
  if (!val) return;
  if (reportTypeChosen) { val.textContent = REPORT_TYPE_LABEL[reportTargetType] || '선택하세요'; val.classList.add('selected'); }
  else { val.textContent = '선택하세요'; val.classList.remove('selected'); }
}
function setReportTargetType(type, chosen) {
  reportTargetType = ['place', 'campaign', 'review'].includes(type) ? type : 'campaign';
  const sel = document.getElementById('reportTargetTypeSelect');
  if (sel) sel.value = reportTargetType;
  reportTypeChosen = !!chosen;
  syncReportTypeTrigger();
  updateReportTargetLabel();
  populateReportReasons(reportTargetType);
}
function updateReportTargetLabel() {
  // 신고 대상 유형을 고른 뒤 라벨을 '신고할 캠페인/매장/후기'로. 미선택 시 '신고할 대상'.
  const label = document.getElementById('reportTargetLabel');
  if (!label || !label.firstChild) return;
  const map = { place: '신고할 매장', campaign: '신고할 캠페인', review: '신고할 후기' };
  label.firstChild.nodeValue = (reportTypeChosen ? (map[reportTargetType] || '신고할 대상') : '신고할 대상') + ' ';
}
function selectReportTargetType(select) {
  setReportTargetType(select.value, true);   // 사용자가 직접 선택 → chosen(트리거에 유형 표시)
  reportSelectedId = null; reportSelectedPlaceId = null; _reportReviews = [];
  document.getElementById('reportResultsList').innerHTML = '';
  clearFieldError('reportTarget');
  // 매장에서 신고 진입했으면, 고른 유형을 그 매장으로 자동 스코프(다시 검색 불필요)
  if (reportContextPlaceId) { applyReportContext(); return; }
  renderReportResults();
}

// 매장 맥락(reportContextPlaceId)을 현재 선택한 대상 유형에 맞게 적용
function applyReportContext() {
  const place = places.find(p => p.id === reportContextPlaceId);
  const searchEl = document.getElementById('reportSearchInput');
  if (!place) { renderReportResults(); return; }
  searchEl.value = place.name;
  syncReportClearBtn();   // 코드가 자동 입력한 값에도 지우기(×) 버튼을 노출
  if (reportTargetType === 'place') {
    reportSelectedId = place.id;          // 매장 신고: 그 매장 자동 선택
    renderReportResults();
  } else if (reportTargetType === 'review') {
    pickReportPlaceForReview(place.id);   // 후기 신고: 그 매장 후기 목록 바로 로드
  } else {
    // 캠페인 신고: 그 매장의 진행 중 캠페인 목록. 1건뿐이면 자동 선택.
    const today = getKSTTodayUTC();
    const active = campaigns.filter(c => !c.hidden && c.placeId === place.id && deadlineToUTC(c.deadline) >= today);
    if (active.length === 1) reportSelectedId = active[0].id;
    renderReportResults();
  }
}

function searchReportTarget() {
  reportSelectedId = null;
  if (reportTargetType === 'review') { reportSelectedPlaceId = null; _reportReviews = []; }
  clearFieldError('reportTarget');
  renderReportResults();
}

function reportResultItem(id, name, metaHtml, selected) {
  return `<div class="place-result-item ${selected ? 'selected' : ''}" onclick="selectReportTarget(${id})">
      <div class="place-result-info">
        <div class="place-result-name">${rvEsc(name)}</div>
        ${metaHtml ? `<div class="place-result-meta">${metaHtml}</div>` : ''}
      </div>
      <span class="place-result-check ${selected ? 'selected' : ''}">✓</span>
    </div>`;
}

function renderReportResults() {
  const listEl = document.getElementById('reportResultsList');
  if (!reportTypeChosen) { listEl.innerHTML = '<div class="search-hint">신고 대상을 먼저 선택하세요.</div>'; return; }
  const q = document.getElementById('reportSearchInput').value.trim();
  if (reportTargetType === 'place') return renderReportPlaces(q, listEl);
  if (reportTargetType === 'review') return renderReportReviews(q, listEl);
  return renderReportCampaigns(q, listEl);
}

// 캠페인 신고: 매장명 검색 → 진행 중 캠페인 목록 (마감 제외)
function renderReportCampaigns(q, listEl) {
  if (!q) { listEl.innerHTML = ''; return; }
  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(q);
  if (reportSelectedId) {
    const c = campaigns.find(c => c.id === reportSelectedId);
    const place = c ? places.find(p => p.id === c.placeId) : null;
    if (c && place) { listEl.innerHTML = reportResultItem(c.id, place.name, `${reportPlatformTag(c.platform)}<span class="place-result-addr">${rvEsc(c.content)}</span>`, true); return; }
  }
  const today = getKSTTodayUTC();
  const nameMatched = campaigns.filter(c => { if (c.hidden) return false; const p = places.find(p => p.id === c.placeId); return p && normalize(p.name).includes(nq); });
  const matches = nameMatched.filter(c => deadlineToUTC(c.deadline) >= today);
  if (!matches.length) {
    listEl.innerHTML = nameMatched.length
      ? '<div class="search-hint">진행 중인 협찬이 없어 신고할 대상이 없어요.</div>'
      : '<div class="search-hint error">검색 결과가 없어요. 매장명을 다시 확인해주세요.</div>';
    return;
  }
  listEl.innerHTML = matches.map(c => { const p = places.find(p => p.id === c.placeId); return reportResultItem(c.id, p.name, `${reportPlatformTag(c.platform)}<span class="place-result-addr">${rvEsc(c.content)}</span>`, reportSelectedId === c.id); }).join('');
}

// 매장 신고: 매장명 검색 → 매장 선택
function renderReportPlaces(q, listEl) {
  if (!q) { listEl.innerHTML = ''; return; }
  const nq = q.replace(/\s/g, '').toLowerCase();
  const matches = places.filter(p => !p.hidden && p.name.replace(/\s/g, '').toLowerCase().includes(nq)).slice(0, 20);
  if (!matches.length) { listEl.innerHTML = '<div class="search-hint error">검색 결과가 없어요. 매장명을 다시 확인해주세요.</div>'; return; }
  listEl.innerHTML = matches.map(p => reportResultItem(p.id, p.name, `<span class="place-result-addr">${rvEsc(p.address || '')}</span>`, reportSelectedId === p.id)).join('');
}

// 후기 신고: 매장명 검색 → 매장 선택 → 그 매장 후기 목록 → 후기 선택
function renderReportReviews(q, listEl) {
  if (reportSelectedPlaceId) {
    // 매장은 검색칸의 X(전체삭제)로 다시 선택 (별도 백링크 없음)
    if (!_reportReviews.length) { listEl.innerHTML = '<div class="search-hint">등록된 후기가 없어요.</div>'; return; }
    listEl.innerHTML = _reportReviews.map(rv => reportResultItem(rv.id, rv.title, `<span class="place-result-addr">${rvEsc(rv.author || '')}</span>`, reportSelectedId === rv.id)).join('');
    return;
  }
  if (!q) { listEl.innerHTML = ''; return; }
  const nq = q.replace(/\s/g, '').toLowerCase();
  const matches = places.filter(p => !p.hidden && p.name.replace(/\s/g, '').toLowerCase().includes(nq)).slice(0, 20);
  if (!matches.length) { listEl.innerHTML = '<div class="search-hint error">검색 결과가 없어요. 매장명을 다시 확인해주세요.</div>'; return; }
  listEl.innerHTML = '<div class="search-hint">후기를 신고할 매장을 선택하세요.</div>' + matches.map(p =>
    `<div class="place-result-item" onclick="pickReportPlaceForReview(${p.id})"><div class="place-result-info"><div class="place-result-name">${rvEsc(p.name)}</div></div><span class="place-result-check">›</span></div>`).join('');
}
async function pickReportPlaceForReview(placeId) {
  reportSelectedPlaceId = placeId; reportSelectedId = null; _reportReviews = [];
  const listEl = document.getElementById('reportResultsList');
  listEl.innerHTML = '<div class="search-hint">불러오는 중…</div>';
  try {
    const list = await fetch(`/api/places?reviews=list&placeId=${placeId}`).then(r => r.json());
    _reportReviews = Array.isArray(list) ? list : [];
  } catch (e) { _reportReviews = []; }
  renderReportResults();
}
// 신고 검색칸의 지우기(×) 버튼을 현재 값에 맞게 노출/숨김 (프로그램적 값 설정 후 호출)
function syncReportClearBtn() {
  const input = document.getElementById('reportSearchInput');
  if (!input) return;
  const wrap = input.closest('.input-wrap');
  const btn = wrap ? wrap.querySelector('.btn-input-clear') : null;
  if (btn) btn.classList.toggle('show', input.value.length > 0);
}

function reportPlatformTag(platform) {
  if (!platform) return '';
  const color = getPlatformColor(platform);
  return `<span class="report-platform-tag" style="background:${color}29;color:${color}">${platform}</span>`;
}

function selectReportTarget(id) {
  reportSelectedId = reportSelectedId === id ? null : id;
  clearFieldError('reportTarget');
  renderReportResults();
}

function selectReportReason(select) {
  reportSelectedReason = select.value;
  clearFieldError('reportReason');
}

function submitReport() {
  let valid = true;
  if (!reportSelectedId) { showFieldError('reportTarget'); valid = false; }
  if (!reportSelectedReason) { showFieldError('reportReason'); valid = false; }
  if (!valid) return;

  const detail = document.getElementById('reportDetail').value.trim();
  const body = { targetType: reportTargetType, reason: reportSelectedReason, detail };
  if (reportTargetType === 'place') body.placeId = reportSelectedId;
  else if (reportTargetType === 'review') body.reviewId = reportSelectedId;
  else body.campaignId = reportSelectedId;
  fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(() => {
      closeReportModal();
      showToast('신고가 접수되었어요. 확인 후 처리할게요.');
    })
    .catch(() => showToast('신고 접수에 실패했어요. 다시 시도해주세요.'));
}

// ===== PC 탭 전환 =====
function switchPcTab(tab) {
  if (window.innerWidth <= 640) return;

  const campaignsTab = document.getElementById('tabCampaigns');
  const reportTab = document.getElementById('tabReport');
  const reportIssueTab = document.getElementById('tabReportIssue');
  const aboutTab = document.getElementById('tabAbout');
  const myInfoTab = document.getElementById('tabMyInfo');

  pcTabActive = tab;
  campaignsTab?.classList.toggle('active', tab === 'campaigns');
  reportTab?.classList.toggle('active', tab === 'report');
  reportIssueTab?.classList.toggle('active', tab === 'reportissue');
  aboutTab?.classList.toggle('active', tab === 'about');
  myInfoTab?.classList.toggle('active', tab === 'myinfo');
  document.body.classList.toggle('pc-report-mode', tab === 'report');
  document.body.classList.toggle('pc-reportissue-mode', tab === 'reportissue');
  document.body.classList.toggle('pc-about-mode', tab === 'about');
  document.body.classList.toggle('pc-myinfo-mode', tab === 'myinfo');

  if (tab === 'report') {
    document.getElementById('modalOverlay').classList.add('open');
    resetModal();
  } else {
    document.getElementById('modalOverlay').classList.remove('open');
  }

  if (tab === 'reportissue') {
    document.getElementById('reportOverlay').classList.add('open');
    resetReportModal();
  } else {
    document.getElementById('reportOverlay').classList.remove('open');
  }

  if (tab === 'about') {
    document.getElementById('aboutOverlay').classList.add('open');
  } else {
    document.getElementById('aboutOverlay').classList.remove('open');
  }

  if (tab === 'myinfo') {
    openMyInfoPanel();
  } else {
    document.getElementById('profileOverlay').classList.remove('open');
  }

  // 협찬찾기로 복귀 시 "모집 중인 협찬" 리스트 스크롤을 맨 위로
  // (사이드바가 display:none→flex로 다시 보일 때 브라우저가 직전 스크롤을 복원하는 것 방지)
  if (tab === 'campaigns') {
    const list = document.getElementById('campaignList');
    if (list) { void list.offsetHeight; list.scrollTop = 0; }
  }

  setTimeout(function() { window.dispatchEvent(new Event('resize')); }, 50);
}

function searchRegionPC() {
  const el = document.getElementById('regionSearchPC');
  if (!el || !el.value.trim()) return;
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
}

function openModal() {
  if (window.innerWidth > 640) {
    switchPcTab('report');
    return;
  }
  document.getElementById('modalOverlay').classList.add('open');
  resetModal();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  resetModalScroll('modalOverlay');
  if (window.innerWidth > 640 && pcTabActive === 'report') {
    pcTabActive = 'campaigns';
    document.body.classList.remove('pc-report-mode');
    document.getElementById('tabCampaigns')?.classList.add('active');
    document.getElementById('tabReport')?.classList.remove('active');
  }
}

function initDeadlineSelects() {
  const yearSel = document.getElementById('inputDeadlineYear');
  if (!yearSel || yearSel.options.length) return;
  const monthSel = document.getElementById('inputDeadlineMonth');
  const daySel = document.getElementById('inputDeadlineDay');
  const { y: curY } = getKSTDateParts();
  yearSel.innerHTML = `<option value="">선택</option>` + Array.from({ length: 3 }, (_, i) => curY + i).map(y => `<option value="${y}">${y}</option>`).join('');
  monthSel.innerHTML = `<option value="">선택</option>` + Array.from({ length: 12 }, (_, i) => i + 1).map(m => `<option value="${m}">${m}</option>`).join('');
  daySel.innerHTML = `<option value="">선택</option>` + Array.from({ length: 31 }, (_, i) => i + 1).map(d => `<option value="${d}">${d}</option>`).join('');
}

function resetModal() {
  clearAllFieldErrors();
  initDeadlineSelects();
  ['inputDeadlineYear', 'inputDeadlineMonth', 'inputDeadlineDay'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.value = '';
    const valueEl = document.getElementById(id + 'Value');
    if (valueEl) { valueEl.textContent = '-'; valueEl.classList.remove('selected'); }
  });
  modalSelectedPlaceId = null; modalIsNewPlace = true;
  modalSelectedLat = null; modalSelectedLng = null; modalSelectedAddress = '';
  modalSelectedResultKey = null; lastNaverResults = [];
  lastSearchQuery = ''; placeResultsVisibleCount = PLACE_RESULTS_PAGE_SIZE;
  document.getElementById('step1').style.display = 'flex';
  document.getElementById('step2').style.display = 'none';
  ['inputName','inputContent','inputHours','inputNickname']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('inputCategory').value = '';
  syncSelectTrigger('inputCategory');
  document.getElementById('inputUrlPlatform').value = '';
  syncSelectTrigger('inputUrlPlatform');
  updateUrlPlatform('');
  document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('inputPlatform').value = '';
  syncSelectTrigger('inputPlatform');
  const holiday = document.getElementById('holidayExclude');
  if (holiday) { holiday.classList.remove('active'); }
  document.getElementById('modalStickyHeader').classList.remove('show');
  // 모바일: modal-header 숨기기 (step1-scroll-header가 대체)
  const _mh = document.querySelector('#modalOverlay .modal-header');
  if (_mh) _mh.style.display = window.innerWidth <= 640 ? 'none' : 'flex';
  updateStepDots(1);
  const step1Body = document.getElementById('step1Body');
  if (step1Body) {
    step1Body.removeEventListener('scroll', handleStep1Scroll);
    step1Body.addEventListener('scroll', handleStep1Scroll, { passive: true });
    step1Body.scrollTop = 0;
  }
  document.getElementById('placeResultsList').innerHTML = '';
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#modalOverlay .btn-input-clear').forEach(b => b.classList.remove('show'));
  syncFounderSection();
}

// 로그인 상태에 따라 '내 이름 남기기' 영역 동기화 (모달 열 때 + step2 진입 시 재평가)
// 로그인→로그아웃 후 step2로 넘어가도 잔여 로그인 정보가 남지 않도록 정리
function syncFounderSection() {
  const nicknameEl = document.getElementById('inputNickname');
  const urlTrigger = document.getElementById('inputUrlPlatformTrigger');
  const urlIdEl = document.getElementById('inputUrlId');
  const lockedHint = document.getElementById('inputLockedHint');
  const guestHint = document.getElementById('inputGuestHint');
  if (currentUser) {
    if (nicknameEl) { nicknameEl.value = currentUser.nickname || ''; nicknameEl.readOnly = true; }
    if (guestHint) guestHint.style.display = 'none';
    if (currentUser.urlPlatform && currentUser.urlId) {
      // 로그인 + SNS 등록: 파란 요약 카드로 표시 (입력 필드 숨김)
      const sel = document.getElementById('inputUrlPlatform');
      if (sel) { sel.value = currentUser.urlPlatform; syncSelectTrigger('inputUrlPlatform'); }
      if (urlIdEl) urlIdEl.value = currentUser.urlId;
      showFounderSummary(currentUser);
    } else {
      hideFounderSummary();
      if (urlTrigger) urlTrigger.classList.remove('locked');
      if (urlIdEl) urlIdEl.readOnly = false;
      if (lockedHint) lockedHint.style.display = 'none';
    }
  } else {
    // 비로그인: 요약 카드 숨기고 입력 필드 노출. 직전이 로그인 UI였다면 잔여값 정리
    const wasLoggedInUI = nicknameEl && nicknameEl.readOnly;
    hideFounderSummary();
    if (nicknameEl) { if (wasLoggedInUI) nicknameEl.value = ''; nicknameEl.readOnly = false; }
    if (wasLoggedInUI) {
      const sel = document.getElementById('inputUrlPlatform');
      if (sel) { sel.value = ''; syncSelectTrigger('inputUrlPlatform'); }
      updateUrlPlatform('', 'input');
    }
    if (urlTrigger) urlTrigger.classList.remove('locked');
    if (urlIdEl) urlIdEl.readOnly = false;
    if (lockedHint) lockedHint.style.display = 'none';
    if (guestHint) guestHint.style.display = 'flex';
  }
}

function showFounderSummary(user) {
  const card = document.getElementById('founderSummaryCard');
  const fields = document.getElementById('founderInputFields');
  const nick = document.getElementById('founderSummaryNick');
  const sns = document.getElementById('founderSummarySns');
  const icon = document.getElementById('founderSummaryIcon');
  const url = document.getElementById('founderSummaryUrl');
  if (nick) nick.textContent = user.nickname || '';
  const domain = URL_PLATFORM_DOMAINS[user.urlPlatform] || '';
  const ic = URL_PLATFORM_ICONS[user.urlPlatform];
  if (sns) {
    if (domain && user.urlId) {
      if (url) url.textContent = domain + user.urlId;
      if (icon) { if (ic) { icon.src = ic; icon.style.display = 'block'; } else icon.style.display = 'none'; }
      sns.style.display = 'flex';
    } else {
      sns.style.display = 'none';
    }
  }
  if (card) card.style.display = 'flex';
  if (fields) fields.style.display = 'none';
}

function hideFounderSummary() {
  const card = document.getElementById('founderSummaryCard');
  const fields = document.getElementById('founderInputFields');
  if (card) card.style.display = 'none';
  if (fields) fields.style.display = '';
}

function updateStepDots(step) {
  [document.getElementById('stepDots'), document.getElementById('stickyStepDots')].forEach(container => {
    if (!container) return;
    const dots = container.querySelectorAll('.step-dot');
    dots.forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i === step - 1) {
        d.classList.add('active');
        d.textContent = i + 1;
      } else if (i < step - 1) {
        d.classList.add('done');
        d.textContent = '✓';
      } else {
        d.textContent = i + 1;
      }
    });
  });
}

function showFieldError(fieldId) {
  const el = document.getElementById(fieldId === 'channel' ? 'channelError' : fieldId + 'Error');
  if (el) el.classList.add('show');
  const input = document.getElementById(fieldId === 'channel' ? null : fieldId + 'Trigger') ||
                document.getElementById(fieldId === 'reportTarget' ? 'reportSearchInput' : fieldId);
  if (input) input.classList.add('input-error');
}

function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId === 'channel' ? 'channelError' : fieldId + 'Error');
  if (el) el.classList.remove('show');
  const trigger = document.getElementById(fieldId + 'Trigger');
  const input = document.getElementById(fieldId === 'reportTarget' ? 'reportSearchInput' : fieldId);
  if (trigger) trigger.classList.remove('input-error');
  if (input) input.classList.remove('input-error');
}

function clearAllFieldErrors() {
  document.querySelectorAll('.field-error-msg').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function goStep2() {
  const nameVal = document.getElementById('inputName').value.trim();
  if (!nameVal) {
    document.getElementById('inputNameError').textContent = '매장명을 입력해주세요.';
    showFieldError('inputName');
    return;
  }
  if (!modalSelectedLat) {
    document.getElementById('inputNameError').textContent = '검색 결과에서 매장을 선택해주세요.';
    showFieldError('inputName');
    return;
  }

  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'flex';
  updateStepDots(2);
  // step1에서 로그인/로그아웃이 바뀌었을 수 있으므로 '내 이름 남기기' 재동기화
  syncFounderSection();

  // step1 → step2: 스크롤 리스너 교체
  const _s1b = document.getElementById('step1Body');
  if (_s1b) _s1b.removeEventListener('scroll', handleStep1Scroll);
  const step2Body = document.getElementById('step2Body');
  step2Body.removeEventListener('scroll', handleStep2Scroll);
  step2Body.addEventListener('scroll', handleStep2Scroll, { passive: true });
  step2Body.scrollTop = 0;
  document.getElementById('modalStickyHeader').classList.remove('show');

  const name = document.getElementById('inputName').value.trim();
  const catField = document.getElementById('newPlaceCategoryField');

  if (!modalIsNewPlace) {
    catField.style.display = 'block';
    const place = places.find(p => p.id === modalSelectedPlaceId);
    document.getElementById('inputCategory').value = place.category || '';
    syncSelectTrigger('inputCategory');
    document.getElementById('founderSection').style.display = 'flex';
    document.getElementById('founderSectionTitle').textContent = '내 이름 남기기';
    document.getElementById('founderSectionDesc').textContent = '이 캠페인의 제보자로 표시돼요';
    document.getElementById('selectedPlaceBadge').innerHTML =
      `<div class="selected-place-badge"><div class="badge-icon"></div><span class="badge-text"><strong>${place.name}</strong>에 새 캠페인 추가</span></div>`;
  } else {
    catField.style.display = 'block';
    document.getElementById('founderSection').style.display = 'flex';
    document.getElementById('founderSectionTitle').textContent = '내 이름 남기기';
    document.getElementById('founderSectionDesc').textContent = '새 장소 최초 제보자로 영구 등록돼요';
    document.getElementById('selectedPlaceBadge').innerHTML =
      `<div class="selected-place-badge"><div class="badge-icon"></div><span class="badge-text"><strong>${name}</strong> 새로 등록</span></div>`;
  }
}

function goStep1() {
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  const _mh = document.querySelector('#modalOverlay .modal-header');
  if (_mh) _mh.style.display = window.innerWidth <= 640 ? 'none' : 'flex';
  document.getElementById('modalStickyHeader').classList.remove('show');
  updateStepDots(1);
  // step2 → step1: 스크롤 리스너 교체
  const step2Body = document.getElementById('step2Body');
  step2Body.removeEventListener('scroll', handleStep2Scroll);
  const step1Body = document.getElementById('step1Body');
  if (step1Body) {
    step1Body.removeEventListener('scroll', handleStep1Scroll);
    step1Body.addEventListener('scroll', handleStep1Scroll, { passive: true });
    step1Body.scrollTop = 0;
  }
}

function toggleOptional() {
  const fields = document.getElementById('optionalFields');
  const hidden = fields.style.display === 'none';
  fields.style.display = hidden ? 'block' : 'none';
  document.getElementById('optionalToggleText').textContent = hidden ? '▴ 선택 정보 접기' : '▾ 선택 정보 추가하기';
}

function toggleDay(btn) {
  btn.classList.toggle('active');
  // ALL 버튼 상태 업데이트
  const allBtn = document.querySelector('.day-btn-all');
  if (allBtn) {
    const dayBtns = [...document.querySelectorAll('.day-btn:not(.day-btn-all)')];
    allBtn.classList.toggle('active', dayBtns.every(b => b.classList.contains('active')));
  }
}

function toggleAllDays(btn) {
  const isActive = btn.classList.contains('active');
  document.querySelectorAll('.day-btn:not(.day-btn-all)').forEach(b => {
    b.classList.toggle('active', !isActive);
  });
  btn.classList.toggle('active', !isActive);
}

function toggleChannel(btn) {
  btn.classList.toggle('active');
}

function toggleHoliday(row) {
  const checkbox = row.querySelector('.holiday-checkbox');
  if (checkbox) checkbox.classList.toggle('active');
}

function handleStep1Scroll() {
  if (window.innerWidth > 640) return;
  const body = document.getElementById('step1Body');
  const header = document.getElementById('modalStickyHeader');
  const scrollHeader = document.getElementById('step1ScrollHeader');
  if (!body || !header || !scrollHeader) return;
  const threshold = scrollHeader.offsetTop + scrollHeader.offsetHeight;
  if (body.scrollTop > threshold) {
    header.classList.add('show');
  } else {
    header.classList.remove('show');
  }
}

function handleStep2Scroll() {
  if (window.innerWidth > 640) return;
  const body = document.getElementById('step2Body');
  const header = document.getElementById('modalStickyHeader');
  const scrollHeader = document.getElementById('step2ScrollHeader');
  if (!body || !header || !scrollHeader) return;
  // step2ScrollHeader 하단이 스크롤 아웃되면 sticky 표시
  const threshold = scrollHeader.offsetTop + scrollHeader.offsetHeight;
  if (body.scrollTop > threshold) {
    header.classList.add('show');
  } else {
    header.classList.remove('show');
  }
}

// ===== 제보 제출 =====
let _submittingCampaign = false;
async function submitCampaign() {
  if (_submittingCampaign) return;

  const channels = [...document.querySelectorAll('.channel-btn.active')].map(b => b.dataset.channel);
  const platform = document.getElementById('inputPlatform').value;
  const content = document.getElementById('inputContent').value.trim();
  const dY = document.getElementById('inputDeadlineYear').value;
  const dM = document.getElementById('inputDeadlineMonth').value;
  const dD = document.getElementById('inputDeadlineDay').value;
  const deadline = (dY && dM && dD) ? `${dY}-${String(dM).padStart(2, '0')}-${String(dD).padStart(2, '0')}` : '';
  const link = '';

  const category = document.getElementById('inputCategory').value;

  let valid = true;
  if (!channels.length) { showFieldError('channel'); valid = false; }
  if (!category) { showFieldError('inputCategory'); valid = false; }
  if (!platform) {
    document.getElementById('inputPlatformError').textContent = '플랫폼을 선택해주세요.';
    showFieldError('inputPlatform'); valid = false;
  } else if (!modalIsNewPlace && hasPlatformAlready(modalSelectedPlaceId, platform)) {
    document.getElementById('inputPlatformError').textContent = `이미 ${platform}로 등록된 협찬이 있어요. 다른 플랫폼을 선택해주세요.`;
    showFieldError('inputPlatform'); valid = false;
  }
  if (!content) { showFieldError('inputContent'); valid = false; }
  if (!deadline) {
    showFieldError('inputDeadline');
    ['inputDeadlineYearTrigger', 'inputDeadlineMonthTrigger', 'inputDeadlineDayTrigger'].forEach(id => document.getElementById(id)?.classList.add('input-error'));
    valid = false;
  }
  if (!valid) return;

  _submittingCampaign = true;
  const submitBtn = document.querySelector('.btn-submit');
  if (submitBtn) submitBtn.disabled = true;

  const reporterUrl = buildReporterUrl();
  const reporterNickname = document.getElementById('inputNickname').value.trim();

  let placeId;
  try {
  if (modalIsNewPlace) {
    const newPlace = await fetch('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('inputName').value.trim(),
        address: modalSelectedAddress,
        lat: modalSelectedLat, lng: modalSelectedLng,
        category,
        founderNickname: reporterNickname,
        founderUrl: reporterUrl
      })
    }).then(r => r.json());
    places.push(newPlace);
    placeId = newPlace.id;
  } else {
    placeId = modalSelectedPlaceId;
    await fetch(`/api/places?id=${placeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category })
    });
    const place = places.find(p => p.id === placeId);
    if (place) {
      place.category = category;
      // 최초제보자가 없던 매장(어드민 시딩 등)이면 이 제보자를 최초제보자로 즉시 반영 (서버도 동일 조건으로 지정)
      if (!place.founderNickname || !place.founderNickname.trim()) {
        place.founderNickname = reporterNickname;
        place.founderUrl = reporterUrl;
      }
    }
  }

  const newCampaign = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId, channels, platform, content, deadline, link,
      operatingDays: [...document.querySelectorAll('.day-btn.active')].map(b => b.textContent),
      excludeHoliday: document.getElementById('holidayExclude')?.classList.contains('active') ?? false,
      operatingHours: document.getElementById('inputHours').value.trim(),
      reporterNickname, reporterUrl, source: 'user'
    })
  }).then(r => r.json());
  campaigns.push(newCampaign);
  invalidateActiveCache();
  updateStatCount();

  closeModal();
  renderAll();

  const place = places.find(p => p.id === placeId);
  map.setCenter(new naver.maps.LatLng(place.displayLat ?? place.lat, place.displayLng ?? place.lng));
  map.setZoom(16);
  showToast(`${place.name} 제보 완료!`);
  maybePromptSnsRegister();
  } finally {
    _submittingCampaign = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

// 제보 완료 후 SNS 미등록자에게 등록 유도 (메뉴에 묻지 않고 행동 흐름에)
function maybePromptSnsRegister() {
  if (!currentUser) {
    setTimeout(() => showAlert(
      '제보 완료! 간편 로그인하면 더 편해져요',
      '로그인 후 SNS 계정을 등록하면 다음 제보부터 자동입력되고, 내 블로그가 핀에 연결돼요.',
      { twoButton: true, confirmText: '로그인하기', cancelText: '다음에', onConfirm: openLoginSheet }
    ), 700);
  } else if (!(currentUser.urlPlatform && currentUser.urlId) && !_snsRegisterPrompted()) {
    setTimeout(() => showAlert(
      'SNS 계정을 등록해보세요',
      '등록하면 다음 제보부터 자동입력되고, 내 블로그가 핀에 연결돼요.',
      { twoButton: true, confirmText: '등록하기', cancelText: '다음에', onConfirm: openProfileSheet }
    ), 700);
  }
}

// 가입 안내(SNS 등록 권유)를 이미 한 번 노출했는지 — 건너뛴 사용자는 다시 권유하지 않음
function _snsRegisterPrompted() {
  try { return !!localStorage.getItem('snsRegisterPrompted'); } catch (e) { return false; }
}

// ===== 토스트 =====
let _toastTimer = null;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.innerHTML = msg;
  toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.classList.remove('show'); _toastTimer = null; }, 3000);
}

// ===== 실시간 제보 알림 =====
// 실제 등록된 캠페인 기반: 유저 실제 제보를 우선으로, 부족하면 어드민 등록분을 익명으로 채워 최신 10건 풀을 구성
function buildLiveMessagePool() {
  const withPlace = (c) => {
    const place = places.find(p => p.id === c.placeId);
    return place ? { nick: c.source === 'user' ? (c.reporterNickname || '익명') : '익명', place: place.name, placeId: place.id, createdAt: c.createdAt || '' } : null;
  };
  // 마감 지난 캠페인은 제외 (getActiveCampaigns와 동일 기준, 빈 마감일=마감없음은 포함)
  const isLive = c => !c.hidden && deadlineToUTC(c.deadline) >= getKSTTodayUTC();
  const userOnes = campaigns.filter(c => c.source === 'user' && isLive(c)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const otherOnes = campaigns.filter(c => c.source !== 'user' && isLive(c)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const pool = [...userOnes, ...otherOnes].slice(0, 10).map(withPlace).filter(Boolean);
  // 셔플 (Fisher-Yates) — 매번 같은 순서로 도는 느낌 방지
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
let _liveMessages = [];
let _liveIdx = 0;
let _liveBubbleTimer = null;
const _chFramesPC = ['image/img_ch_01.png','image/img_ch_02.png','image/img_ch_03.png','image/img_ch_04.png','image/img_ch_05.png'];
const _chFramesMobile = ['image/img_ch_m_01.png','image/img_ch_m_02.png','image/img_ch_m_03.png','image/img_ch_m_04.png','image/img_ch_m_05.png'];
function getChFrames() { return window.innerWidth <= 640 ? _chFramesMobile : _chFramesPC; }

function playCharacterAnim() {
  const el = document.getElementById('liveCharacter');
  if (!el) return;
  const frames = getChFrames();
  let f = 0;
  const tick = setInterval(() => {
    el.src = frames[f % frames.length];
    f++;
    if (f >= frames.length * 2) { // 2회 순환 후 마지막 프레임 고정
      clearInterval(tick);
      el.src = frames[0];
    }
  }, 100);
}

function getEulReul(word) {
  const last = word[word.length - 1];
  const code = last ? last.charCodeAt(0) : 0;
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 === 0 ? '를' : '을';
  }
  return '를';
}

let _liveBubblePlaceId = null;
function showLiveBubble(data) {
  const bubble = document.getElementById('liveBubble');
  const text = document.getElementById('liveBubbleText');
  if (!bubble || !text) return;
  if (_liveBubbleTimer) clearTimeout(_liveBubbleTimer);
  bubble.classList.remove('show');
  setTimeout(() => {
    // 매장명 16자 초과 시 … 처리 (을/를 조사는 잘린 마지막 실제 글자 기준)
    const baseName = data.place.length > 16 ? data.place.slice(0, 16) : data.place;
    const dispName = data.place.length > 16 ? baseName + '…' : data.place;
    const particle = getEulReul(baseName);
    text.innerHTML = `${data.nick}님이 <strong>${dispName}</strong>${particle}<br>추가했어요!`;
    _liveBubblePlaceId = data.placeId;
    bubble.classList.add('show');
    playCharacterAnim();
    _liveBubbleTimer = setTimeout(() => bubble.classList.remove('show'), 5000);
  }, 100);
}

function clickLiveBubble() {
  if (_liveBubblePlaceId != null) focusPlace(_liveBubblePlaceId);
}

// 제보왕(리더보드) 배너 노출 여부 — 베타 이벤트 시작 시 true로 변경
const LEADERBOARD_ENABLED = false;
async function renderLeaderboard() {
  if (!LEADERBOARD_ENABLED) {
    ['leaderboardBannerMobile', 'leaderboardBannerPC'].forEach(id => document.getElementById(id)?.classList.remove('show'));
    return;
  }
  try {
    const res = await fetch('/api/users?leaderboard=1');
    const data = await res.json();
    const show = data.count > 0;
    [
      ['leaderboardBannerMobile', 'leaderboardNicknameMobile', 'leaderboardCountMobile'],
      ['leaderboardBannerPC', 'leaderboardNicknamePC', 'leaderboardCountPC']
    ].forEach(([bannerId, nicknameId, countId]) => {
      const banner = document.getElementById(bannerId);
      if (!banner) return;
      banner.classList.toggle('show', show);
      if (show) {
        document.getElementById(nicknameId).textContent = data.nickname;
        document.getElementById(countId).textContent = data.count;
      }
    });
  } catch (e) {}
}

function startLiveAlerts() {
  const charEl = document.getElementById('liveCharacter');
  if (charEl) charEl.src = getChFrames()[0];
  _liveMessages = buildLiveMessagePool();
  if (_liveMessages.length === 0) return;
  const delays = [4000, 12000, 22000, 34000, 48000, 64000, 82000];
  delays.forEach((delay, i) => {
    setTimeout(() => {
      showLiveBubble(_liveMessages[i % _liveMessages.length]);
    }, delay);
  });
  setInterval(() => {
    _liveIdx = (_liveIdx + 1) % _liveMessages.length;
    showLiveBubble(_liveMessages[_liveIdx]);
  }, 90000);
}

// ===== 네이버지도 열기 =====
// 매장 id로 호출 (인포윈도우/상세시트 매장명 클릭 → 네이버지도 연결). 좌표가 있으면 정확한 위치로 연결
function openNaverMapByPlace(placeId) {
  const p = places.find(x => x.id === placeId);
  if (p) openNaverMap(p.name, p.address, p.lat, p.lng);
}
function openNaverMap(name, address, lat, lng) {
  // 검색어는 매장명만 사용 — 주소(지번/건물/호수 등 상세 토큰)를 붙이면 네이버 장소검색이
  // 그 토큰까지 매칭하려다 결과가 0건이 되는 경우가 있음. 매장명에 지점명이 포함돼 특정도 충분.
  // 동명 매장 정확도는 모바일 앱 딥링크의 좌표(nmap://place)로 해결.
  const query = encodeURIComponent(name);
  const webUrl = `https://map.naver.com/p/search/${query}`;

  // 앱(Capacitor 웹뷰): nmap:// 딥링크·window.open이 안 먹으므로 인앱 브라우저로 네이버지도 웹을 연다.
  if (isNativeApp()) { openExternal(webUrl); return; }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    // 앱 딥링크 시도: 좌표가 있으면 정확한 위치에 마커(place), 없으면 검색(search)
    const appUrl = (lat != null && lng != null)
      ? `nmap://place?lat=${lat}&lng=${lng}&name=${encodeURIComponent(name)}&appname=muhyeop-map`
      : `nmap://search?query=${query}&appname=muhyeop-map`;
    const start = Date.now();
    window.location.href = appUrl;
    // 앱이 없으면 (300ms 내 화면 전환 없으면) 웹으로 fallback
    setTimeout(() => {
      if (Date.now() - start < 1500) {
        window.open(webUrl, '_blank', 'noopener');
      }
    }, 300);
  } else {
    window.open(webUrl, '_blank', 'noopener');
  }
}

// ===== 모바일 바텀시트 =====
function openMobileSheet(place) {
  // 검색 키패드가 떠 있으면 먼저 닫아 바텀시트가 올바른 위치에 뜨도록
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  const sheet = document.getElementById('mobileSheet');
  const overlay = document.getElementById('mobileSheetOverlay');
  const content = document.getElementById('mobileSheetContent');
  content.innerHTML = createMobileDetailContent(place);
  initDetailTabs(place);
  sheet.style.transform = '';
  sheet.classList.add('show');
  overlay.classList.add('show');
  setSelectedMarker(place.id);
  trackPlaceCampaignViews(place);
  // 핀을 '보이는 지도 영역(상단 검색+필터 아래 ~ 시트 상단 위)'의 세로 중앙으로 이동.
  // 시트 높이가 콘텐츠마다 달라(offsetHeight로 반영), 고정 오프셋 대신 동적으로 중앙 계산.
  const proj = map.getProjection();
  if (proj) {
    const vpH = window.innerHeight;
    const sheetTop = vpH - sheet.offsetHeight;
    const topUI = document.querySelector('.mobile-map-overlay');
    const topBound = topUI ? topUI.getBoundingClientRect().bottom : 120;
    const visibleCenterY = (topBound + sheetTop) / 2;
    const off = proj.fromCoordToOffset(new naver.maps.LatLng(place.displayLat ?? place.lat, place.displayLng ?? place.lng));
    off.y += (vpH / 2 - visibleCenterY); // 지도 중앙에서 이만큼 위로 올려 보이는 영역 중앙에 배치
    map.panTo(proj.fromOffsetToCoord(off));
  }
  // 사이드바 오프스크린으로 내리기
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.style.transition = 'transform 0.3s ease';
    sidebar.style.transform = 'translateY(100%)';
    setTimeout(() => { sidebar.style.transition = ''; }, 300);
  }
}

function closeMobileSheet() {
  const sheet = document.getElementById('mobileSheet');
  sheet.style.transform = '';
  sheet.classList.remove('show');
  document.getElementById('mobileSheetOverlay').classList.remove('show');
  clearSelectedMarker();
  // 사이드바 78px 상태로 복귀
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.style.transition = 'transform 0.3s ease';
    sidebar.style.transform = '';
    setTimeout(() => { sidebar.style.transition = ''; }, 300);
  }
}

// ===== 모집중인협찬 사이드바 스와이프 다운으로 닫기 =====
function initSidebarSwipeToDismiss() {
  const sidebar = document.getElementById('sidebar');
  const header = sidebar.querySelector('.sidebar-header');

  let startY = 0;
  let currentY = 0;
  let dragging = false;
  let dragMode = null; // 'collapse'(펼침→아래로 닫기) | 'expand'(접힘→위로 열기)
  let startTime = 0;   // 플릭(속도) 판정용

  // 접힘(peek) 높이 = 78px + 하단 세이프에어리어(앱 홈 인디케이터, 웹은 0).
  // 드래그 클램프/닫기 목표 위치를 이 값으로 맞춰야 닫을 때 '더 내려갔다 튀어 올라옴'이 없음.
  function peekH() { return 78 + (parseFloat(getComputedStyle(sidebar).paddingBottom) || 0); }

  function startDrag(y) {
    if (window.innerWidth > 640) return false;
    startY = y; currentY = y; dragging = true; startTime = Date.now();
    if (sidebar.classList.contains('expanded')) {
      dragMode = 'collapse';
      sidebar.style.transition = 'none';
    } else {
      dragMode = 'expand'; // 접힘 상태: 위로 쓸어 올려 펼치기 (임계값 방식)
    }
    return true;
  }

  function moveDrag(y) {
    if (!dragging) return;
    currentY = y;
    if (dragMode !== 'collapse') return; // 펼치기 모드는 라이브 변형 없이 임계값만 판단
    const delta = currentY - startY;
    if (delta < 0) return;
    // peek 위치보다 더 내려가지 않게 클램프 → 놓을 때 다시 위로 튀는 오버슈트 방지
    const maxDelta = Math.max(0, sidebar.offsetHeight - peekH());
    sidebar.style.transform = `translateY(${Math.min(delta, maxDelta)}px)`;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const delta = currentY - startY;
    if (dragMode === 'expand') {
      // 위로 20px 이상 쓸면 펼치기 (뒤따르는 click 무시)
      if (delta < -20) { _sidebarSwipeAt = Date.now(); expandSidebar(); }
      return;
    }
    // 닫기 판정: 충분히 내렸거나(80px+) 빠르게 아래로 플릭(속도)하면 닫기
    const velocity = delta / Math.max(1, Date.now() - startTime); // px/ms (양수=아래로)
    if (delta > 80 || (delta > 20 && velocity > 0.4)) {
      _sidebarSwipeAt = Date.now(); // 스와이프로 닫음 → 직후 click 무시
      // peek(헤더 바) 상태로 복귀 — transform만 애니메이션(GPU 가속)해 부드럽게, 끝나면 height를 한 프레임에 교체
      const arrow = document.getElementById('sidebarArrow');
      if (arrow) arrow.textContent = '︿';
      setNaverLogoVisible(true);
      // 닫힘 목표 = peek 높이(78+세이프에어리어)만 남기고 내림. 하드코딩 78이면 앱에서 더 내려갔다 튀어 올라옴.
      const slideTo = Math.max(0, sidebar.offsetHeight - peekH());
      sidebar.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
      sidebar.style.transform = `translateY(${slideTo}px)`;
      // 리스트 내용은 내려가는 '끝 즈음'(딜레이 후 짧게) 페이드아웃 → 마지막에 툭 사라지지 않게
      const listFade = document.getElementById('campaignList');
      if (listFade) { listFade.style.transition = 'opacity 0.18s ease 0.1s'; listFade.style.opacity = '0'; }
      setTimeout(() => {
        // 같은 화면 위치에서 height 축소 + transform 리셋을 원자적으로 교체 → 점프 없음
        sidebar.style.transition = 'none';
        sidebar.classList.remove('expanded');
        sidebar.classList.remove('expanded-full');
        sidebar.style.transform = '';
        const list = document.getElementById('campaignList');
        if (list) { list.scrollTop = 0; list.style.transition = ''; list.style.opacity = ''; }
        requestAnimationFrame(() => { sidebar.style.transition = ''; });
      }, 300);
    } else if (Math.abs(delta) > 6) {
      // 실제로 조금 드래그하다 놓음 → transform 스냅백 애니메이션 후 CSS(height) 트랜지션 복원
      sidebar.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
      sidebar.style.transform = '';
      setTimeout(() => { sidebar.style.transition = ''; }, 250);
    } else {
      // 사실상 탭 → 인라인 트랜지션 즉시 제거해, 뒤따르는 click(toggle)이 CSS height 트랜지션으로 부드럽게 닫히게
      sidebar.style.transition = '';
      sidebar.style.transform = '';
    }
  }

  // 헤더 영역
  header.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientY), { passive: true });
  header.addEventListener('touchmove', (e) => {
    moveDrag(e.touches[0].clientY);
    // 드래그 중엔 앱 WebView의 오버스크롤(러버밴드=팅김) 차단
    if (dragging) e.preventDefault();
  }, { passive: false });
  header.addEventListener('touchend', endDrag);

  // 리스트 영역: 맨 위에서 아래로 당길 때만 닫기
  const list = document.getElementById('campaignList');
  list.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = false;
    dragMode = null;
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    const y = e.touches[0].clientY;
    const delta = y - startY;
    // 맨 위에서 아래로 당길 때만 dismiss 처리
    if (list.scrollTop <= 0 && delta > 0 && sidebar.classList.contains('expanded')) {
      if (!dragging) {
        dragging = true;
        dragMode = 'collapse';
        startTime = Date.now();
        sidebar.style.transition = 'none';
      }
      e.preventDefault();
      currentY = y;
      const maxDelta = Math.max(0, sidebar.offsetHeight - peekH());
      sidebar.style.transform = `translateY(${Math.min(delta, maxDelta)}px)`;
    }
  }, { passive: false });
  list.addEventListener('touchend', endDrag);
}

// ===== 바텀시트 스와이프 다운으로 닫기 =====
function initSheetSwipeToDismiss() {
  const sheet = document.getElementById('mobileSheet');
  const handle = sheet.querySelector('.mobile-sheet-handle');
  const content = document.getElementById('mobileSheetContent');

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  function onTouchStart(e) {
    // 탭/버튼/링크/입력 등 인터랙티브 요소 위에서는 드래그 시작 안 함
    // (탭 탭(tap)이 미세 드래그로 잡혀 click이 취소되는 문제 방지)
    if (e.target.closest('button, a, input, textarea, select, .rv-tab, .rv-register-btn, .rv-like, .detail-report-link, .detail-name-link')) { dragging = false; return; }
    // 리스트가 스크롤돼 있으면 시트 드래그 안 함(리스트 스크롤 우선). 실제 스크롤 요소는 .detail-scroll.
    const scroller = e.target.closest('.detail-scroll');
    if (scroller && scroller.scrollTop > 0) { dragging = false; return; }
    startY = e.touches[0].clientY;
    dragging = true;
    sheet.style.transition = 'none'; // 드래그 중 애니메이션 끔
  }

  function onTouchMove(e) {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    const delta = currentY - startY;
    if (delta < 0) return; // 위로 당기는 건 무시
    sheet.style.transform = `translateY(${delta}px)`;
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;
    const delta = currentY - startY;
    if (delta > 80) {
      sheet.style.transition = 'transform 0.3s ease';
      sheet.style.transform = 'translateY(100%)';
      // 사이드바 동시에 올라오기
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.style.transition = 'transform 0.3s ease';
        sidebar.style.transform = '';
        setTimeout(() => { sidebar.style.transition = ''; }, 300);
      }
      setTimeout(() => {
        sheet.style.transition = 'none';
        sheet.style.transform = '';
        sheet.classList.remove('show');
        document.getElementById('mobileSheetOverlay').classList.remove('show');
        requestAnimationFrame(() => { sheet.style.transition = ''; });
      }, 300);
    } else {
      sheet.style.transition = 'transform 0.25s ease';
      sheet.style.transform = '';
    }
  }

  sheet.addEventListener('touchstart', onTouchStart, { passive: true });
  sheet.addEventListener('touchmove', onTouchMove, { passive: true });
  sheet.addEventListener('touchend', onTouchEnd);
}

// 지도 영역 터치 시 검색창 포커스 해제 및 키보드 닫기
document.addEventListener('click', (e) => {
  if (!e.target.closest('#map')) return;
  if (e.target.closest('.mobile-header-search') || e.target.closest('.pc-search-wrap')) return;
  const active = document.activeElement;
  if (active && (active.id === 'regionSearchMobileOverlay' || active.id === 'regionSearchPC')) {
    active.blur();
  }
});

// 텍스트 필드 clear 버튼 설정
function setupClearButtons() {
  // 모바일 오버레이 검색창 (flex 컨테이너 내부에 버튼 추가)
  const searchInput = document.getElementById('regionSearchMobileOverlay');
  if (searchInput) {
    const btn = createClearBtn();
    searchInput.parentElement.appendChild(btn);
    bindClearBtn(btn, searchInput);
    // 검색창 포커스 시 바텀시트 닫기
    searchInput.addEventListener('focus', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('expanded')) {
        sidebar.classList.remove('expanded', 'expanded-full');
        const arrow = document.getElementById('sidebarArrow');
        if (arrow) arrow.textContent = '︿';
        setTimeout(() => {
          const list = document.getElementById('campaignList');
          if (list) list.scrollTop = 0;
        }, 350);
      }
    });
  }

  // PC 지도 검색창
  const pcSearchInput = document.getElementById('regionSearchPC');
  if (pcSearchInput) {
    const btn = createClearBtn();
    pcSearchInput.parentElement.appendChild(btn);
    bindClearBtn(btn, pcSearchInput);
  }

  // 모달 폼 텍스트 입력 (input-wrap으로 감싸서 절대 위치)
  // 어드민 페이지(#adminApp)에서는 클리어 버튼 스타일(style.css)이 없어 적용하지 않음
  if (!document.getElementById('adminApp')) {
    document.querySelectorAll('.form-group input[type="text"], .form-group input[type="url"]').forEach(input => {
      const wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = createClearBtn();
      wrap.appendChild(btn);
      bindClearBtn(btn, input);
    });
  }
}

function createClearBtn() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-input-clear';
  btn.innerHTML = '<img src="image/ic_text_clear_20.svg" width="20" height="20" alt="지우기">';
  return btn;
}

function bindClearBtn(btn, input) {
  input.addEventListener('input', () => {
    btn.classList.toggle('show', input.value.length > 0);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // blur 방지
  btn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
    btn.classList.remove('show');
  });
}

function updateStatCount() {
  const statCountEl = document.getElementById('pcStatCount');
  if (!statCountEl) return;
  // 지도에 실제 노출되는 것과 동일 기준: 마감 지난 캠페인·숨김 제외 (빈 마감일=상시는 포함)
  const today = getKSTTodayUTC();
  const activeCount = campaigns.filter(c => !c.hidden && deadlineToUTC(c.deadline) >= today).length;
  statCountEl.textContent = activeCount.toLocaleString();
}

document.addEventListener('DOMContentLoaded', setupClearButtons);
document.addEventListener('DOMContentLoaded', initAppDownloadCard);

// ===== 초기 로딩 애니메이션 =====
let _loadingAnim = null;
function initAppLoading() {
  const el = document.getElementById('appLoadingAnim');
  if (el && window.lottie && !_loadingAnim) {
    _loadingAnim = window.lottie.loadAnimation({
      container: el, renderer: 'svg', loop: true, autoplay: true,
      path: 'image/loading.json'
    });
  }
}
// 스플래시(모바일 전용): 화면에 뜬 뒤 로고 애니메이션을 처음부터 재생 → 애니메이션 후 페이드아웃해 뒤의 로딩을 노출. PC는 미노출.
// 앱: 네이티브 스플래시(launchAutoHide:false)가 웹뷰를 덮는 동안 애니가 다 재생돼버리지 않도록,
//     웹 스플래시가 그려진 뒤 네이티브 스플래시를 내리고 그 직후 애니메이션을 시작한다(화면 보일 때 처음부터 재생).
function initSplash() {
  const SP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen;
  const splash = document.getElementById('appSplash');
  const isMobile = window.innerWidth <= 640;
  if (!splash || !isMobile) {
    if (splash) splash.remove();
    if (isNativeApp() && SP) SP.hide().catch(() => {}); // PC/스플래시 없음: 네이티브 스플래시 즉시 숨김
    return;
  }
  const logo = document.getElementById('splashLogo');
  const startAnim = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => { if (logo) logo.classList.add('play'); }));
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => { if (splash.parentNode) splash.remove(); }, 450);
    }, 2400);
  };
  if (isNativeApp() && SP) {
    setTimeout(() => SP.hide().catch(() => {}), 4000); // 안전장치: 무슨 일이 있어도 4s 내 네이티브 스플래시 숨김
    requestAnimationFrame(() => {
      SP.hide({ fadeOutDuration: 250 }).catch(() => {});
      setTimeout(startAnim, 280);
    });
  } else {
    startAnim();
  }
}
document.addEventListener('DOMContentLoaded', initSplash);
// 지도 로딩/인증 실패 시 지도 영역에 안내 화면 노출
function showMapError() {
  const err = document.getElementById('mapError');
  if (err) err.hidden = false;
}
function hideAppLoading() {
  const el = document.getElementById('appLoading');
  if (!el) return;
  el.classList.add('hide');
  setTimeout(() => { el.style.display = 'none'; if (_loadingAnim) { _loadingAnim.destroy(); _loadingAnim = null; } }, 400);
}
document.addEventListener('DOMContentLoaded', initAppLoading);

// 안드로이드 앱 전용: 전체화면 흰 배경 모달이 열리면 상단 상태바를 흰색(어두운 아이콘)으로,
// 지도로 돌아오면 검정으로 전환. iOS/웹엔 window.MuhyeopNativeUI가 없어 자동 무시됨.
function initAndroidStatusBar() {
  const WHITE_MODALS = ['modalOverlay', 'reportOverlay', 'aboutOverlay', 'policyOverlay',
    'profileOverlay', 'reviewFormOverlay', 'signupInfoOverlay', 'signupDoneOverlay',
    'withdrawConfirmOverlay', 'withdrawDoneOverlay'];
  let tries = 0;
  (function waitForBridge() {
    const iface = window.MuhyeopNativeUI;
    if (iface && typeof iface.setStatusBar === 'function') { setup(iface); return; }
    if (tries++ > 20) return; // 최대 ~2초 대기 후 포기(비안드로이드)
    setTimeout(waitForBridge, 100);
  })();
  function setup(iface) {
    let last = null;
    const update = () => {
      const white = WHITE_MODALS.some(id => {
        const el = document.getElementById(id);
        return el && el.classList.contains('open');
      });
      if (white === last) return;
      last = white;
      try { iface.setStatusBar(white); } catch (e) {}
    };
    const obs = new MutationObserver(update);
    WHITE_MODALS.forEach(id => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    update();
  }
}
document.addEventListener('DOMContentLoaded', initAndroidStatusBar);

document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1 && !e.target.closest('#map')) e.preventDefault();
}, { passive: false });

// 이미지/링크/텍스트 끌어당기기(드래그) 방지 — CSS user-select와 함께 앱 느낌 유지
document.addEventListener('dragstart', function(e) { e.preventDefault(); });
// 길게 누름/우클릭 컨텍스트 메뉴 방지 (입력창은 붙여넣기 위해 예외)
document.addEventListener('contextmenu', function(e) {
  if (!e.target.closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
});

window.addEventListener('load', async function() {
  initAppLoading();
  await loadInitialData();
  await refreshAuthUI();
  const url = new URL(location.href);
  if (url.searchParams.get('signup') === '1') {
    url.searchParams.delete('signup');
    history.replaceState(null, '', url.toString());
    // URL 파라미터만 믿지 않고 실제 상태로 판단: SNS 미등록 + 아직 한 번도 안내 안 받은 신규 로그인 사용자에게만 노출
    // (모바일에서 탭이 폐기됐다 복원되면 signup=1이 살아난 채 재로드돼 중복 노출되던 문제 방지)
    if (currentUser && !(currentUser.urlPlatform && currentUser.urlId) && !_snsRegisterPrompted()) {
      openSignupInfoSheet();
    }
  }
  if (!document.getElementById('map')) { hideAppLoading(); return; }
  updateStatCount();
  // 네이버 지도 스크립트가 로드되지 않은 경우(차단/네트워크 실패 등) 안내 화면 노출
  if (typeof naver === 'undefined' || !naver.maps) {
    showMapError();
    hideAppLoading();
    return;
  }
  initMap();
  setTimeout(function() { window.dispatchEvent(new Event('resize')); }, 100);
  startLiveAlerts();
  renderLeaderboard();
  if (LEADERBOARD_ENABLED) setInterval(renderLeaderboard, 60000);
  hideAppLoading();
});

let _prevIsMobile = window.innerWidth <= 640;
window.addEventListener('resize', function() {
  const isMobile = window.innerWidth <= 640;

  if (!_prevIsMobile && isMobile) {
    // PC → 모바일: pc-report-mode 해제
    if (document.body.classList.contains('pc-report-mode')) {
      document.body.classList.remove('pc-report-mode');
      document.getElementById('modalOverlay').classList.remove('open');
      document.getElementById('tabCampaigns')?.classList.add('active');
      document.getElementById('tabReport')?.classList.remove('active');
      document.getElementById('sidebar').style.display = '';
      pcTabActive = 'campaigns';
    }
    // PC → 모바일: pc-myinfo-mode 해제 (좌측 패널 닫고 협찬찾기로 복귀)
    if (document.body.classList.contains('pc-myinfo-mode')) {
      document.body.classList.remove('pc-myinfo-mode');
      document.getElementById('profileOverlay').classList.remove('open');
      document.getElementById('tabCampaigns')?.classList.add('active');
      document.getElementById('tabMyInfo')?.classList.remove('active');
      pcTabActive = 'campaigns';
    }
  }

  if (_prevIsMobile && !isMobile) {
    // 모바일 → PC: 모바일에서 열어둔 모달이 있으면 PC 모드 스타일로 전환 (입력 중인 폼은 유지)
    if (document.getElementById('modalOverlay')?.classList.contains('open')) {
      pcTabActive = 'report';
      document.body.classList.add('pc-report-mode');
      document.getElementById('tabCampaigns')?.classList.remove('active');
      document.getElementById('tabReport')?.classList.add('active');
    } else if (document.getElementById('reportOverlay')?.classList.contains('open')) {
      pcTabActive = 'reportissue';
      document.body.classList.add('pc-reportissue-mode');
      document.getElementById('tabCampaigns')?.classList.remove('active');
      document.getElementById('tabReportIssue')?.classList.add('active');
    } else if (document.getElementById('aboutOverlay')?.classList.contains('open')) {
      pcTabActive = 'about';
      document.body.classList.add('pc-about-mode');
      document.getElementById('tabCampaigns')?.classList.remove('active');
      document.getElementById('tabAbout')?.classList.add('active');
    }
  }

  _prevIsMobile = isMobile;

  if (openPcCardPlace && window.innerWidth > 640) {
    panToCard(openPcCardPlace);
  }
});

// ===== 내 링크 (플랫폼 + 아이디) =====
// 임의 URL을 그대로 저장하지 않고, 도메인을 화이트리스트로 고정해 악성 링크 등록을 막는다
const URL_PLATFORM_DOMAINS = { '블로그': 'blog.naver.com/', '인스타그램': 'instagram.com/' };
const URL_PLATFORM_ICONS = { '블로그': 'image/ic_naver_blog_20.png', '인스타그램': 'image/ic_instagram_20.png' };

function updateUrlPlatform(platform, prefix = 'input', keepId = false) {
  const rowEl = document.getElementById(`${prefix}UrlIdRow`);
  const prefixEl = document.getElementById(`${prefix}UrlDomainPrefix`);
  const idInput = document.getElementById(`${prefix}UrlId`);
  const iconEl = document.getElementById(`${prefix}UrlPlatformIcon`);
  if (!rowEl || !prefixEl || !idInput || !iconEl) return;
  const domain = URL_PLATFORM_DOMAINS[platform] || '';

  rowEl.style.display = domain ? 'flex' : 'none';
  prefixEl.textContent = domain;
  if (!keepId) idInput.value = '';

  // 바텀시트 닫힘 애니메이션(300ms) 끝난 뒤 입력칸이 화면에 들어오도록 스크롤
  if (domain) {
    setTimeout(() => rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 320);
  }

  const icon = URL_PLATFORM_ICONS[platform];
  if (icon) { iconEl.src = icon; iconEl.style.display = 'block'; }
  else { iconEl.removeAttribute('src'); iconEl.style.display = 'none'; }
}

function buildUrlFromInputs(prefix = 'input') {
  const platform = document.getElementById(`${prefix}UrlPlatform`).value;
  const id = document.getElementById(`${prefix}UrlId`).value.trim();
  const domain = URL_PLATFORM_DOMAINS[platform];
  if (!domain || !id) return '';
  return `https://${domain}${id}`;
}

function buildReporterUrl() {
  return buildUrlFromInputs('input');
}

// ===== 커스텀 셀렉트 바텀시트 =====
let _selectSheetTarget = null;

function openSelectSheet(selectId, title) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  _selectSheetTarget = selectId;

  // 셀렉트가 속한 모달로 바텀시트를 이동시켜 해당 모달 영역 안에 정확히 표시되도록 함
  const hostModal = sel.closest('.modal, .signup-page');
  const sheetOverlay = document.getElementById('selectSheetOverlay');
  const sheetPanel = document.getElementById('selectSheetPanel');
  if (hostModal && !hostModal.contains(sheetPanel)) {
    hostModal.appendChild(sheetOverlay);
    hostModal.appendChild(sheetPanel);
  }

  document.getElementById('selectSheetTitle').textContent = title;

  const list = document.getElementById('selectSheetList');
  list.innerHTML = [...sel.options].map(opt => {
    const isActive = opt.value && opt.value === sel.value;
    return `<div class="select-sheet-item${isActive ? ' active' : ''}" onclick="pickSelectItem('${selectId}', '${opt.value.replace(/'/g, "\\'")}', '${opt.textContent.replace(/'/g, "\\'")}')">
      ${opt.textContent}
    </div>`;
  }).filter((_, i) => sel.options[i].value !== '').join(''); // 빈 placeholder 제외

  const panel = document.getElementById('selectSheetPanel');
  panel.style.display = '';
  document.getElementById('selectSheetOverlay').classList.add('show');
  requestAnimationFrame(() => panel.classList.add('show'));
}

function closeSelectSheet() {
  const panel = document.getElementById('selectSheetPanel');
  panel.classList.remove('show');
  // PC 모드 등 일부 환경에서 transform 닫힘이 시각적으로 반영되지 않는 경우가 있어
  // 트랜지션이 끝나면 display:none으로 확실히 화면에서 제거한다
  setTimeout(() => {
    document.getElementById('selectSheetOverlay').classList.remove('show');
    panel.style.display = 'none';
  }, 300);
  _selectSheetTarget = null;
}

function pickSelectItem(selectId, value, label) {
  const sel = document.getElementById(selectId);
  if (sel) sel.value = value;

  const valueEl = document.getElementById(selectId + 'Value');
  if (valueEl) {
    valueEl.textContent = label;
    valueEl.classList.add('selected');
  }

  if (selectId.endsWith('UrlPlatform')) updateUrlPlatform(value, selectId.replace('UrlPlatform', ''));

  // 오류 메시지 클리어
  if (selectId === 'inputPlatform') {
    if (!modalIsNewPlace && hasPlatformAlready(modalSelectedPlaceId, value)) {
      document.getElementById('inputPlatformError').textContent = `이미 ${value}로 등록된 협찬이 있어요. 다른 플랫폼을 선택해주세요.`;
      showFieldError('inputPlatform');
    } else {
      clearFieldError('inputPlatform');
    }
  } else if (selectId.startsWith('inputDeadline')) {
    clearFieldError('inputDeadline');
    ['inputDeadlineYearTrigger', 'inputDeadlineMonthTrigger', 'inputDeadlineDayTrigger'].forEach(id => document.getElementById(id)?.classList.remove('input-error'));
  } else {
    clearFieldError(selectId);
  }

  closeSelectSheet();
  sel.dispatchEvent(new Event('change'));
}

function syncSelectTrigger(selectId) {
  const sel = document.getElementById(selectId);
  const valueEl = document.getElementById(selectId + 'Value');
  if (!sel || !valueEl) return;
  const val = sel.value;
  if (val) {
    const opt = [...sel.options].find(o => o.value === val);
    valueEl.textContent = opt ? opt.textContent : val;
    valueEl.classList.add('selected');
  } else {
    valueEl.textContent = '선택하세요';
    valueEl.classList.remove('selected');
  }
}
