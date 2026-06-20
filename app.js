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

function setSelectedMarker(placeId) {
  if (selectedMarkerId === placeId) return;
  clearSelectedMarker();
  const entry = markerMap[placeId];
  const place = places.find(p => p.id === placeId);
  if (!entry || !place) return;
  entry.marker.setIcon({
    content: `<div class="map-pin map-pin-selected">${getCategoryPinSelected(place.category)}</div>`,
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
      content: `<div class="map-pin">${getCategoryPin(place.category)}</div>`,
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
  const [y, m, d] = deadline.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function getActiveCampaigns(placeId) {
  const today = getKSTTodayUTC();
  return campaigns.filter(c => {
    if (c.placeId !== placeId) return false;
    if (c.hidden) return false;
    if (deadlineToUTC(c.deadline) < today) return false;
    if (currentChannelFilter !== '전체' && !(c.channels || []).includes(currentChannelFilter)) return false;
    return true;
  });
}

function filterChannel(channel) {
  currentChannelFilter = channel;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    const ch = btn.dataset.channel || btn.textContent.replace(/\s/g, '');
    btn.classList.toggle('active', ch === channel);
  });
  renderAll();
}

function hasActiveCampaign(placeId) {
  return getActiveCampaigns(placeId).length > 0;
}

function hasPlatformAlready(placeId, platform) {
  const today = getKSTTodayUTC();
  return campaigns.some(c => c.placeId === placeId && !c.hidden && c.platform === platform && deadlineToUTC(c.deadline) >= today);
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

// ===== 날짜 셀렉트 초기화 =====
function initDateSelects() {
  const { y, m, d } = getKSTDateParts();

  const yearSel = document.getElementById('inputDeadlineYear');
  const monthSel = document.getElementById('inputDeadlineMonth');
  const daySel = document.getElementById('inputDeadlineDay');

  for (let i = y; i <= y + 1; i++) {
    yearSel.innerHTML += `<option value="${i}" ${i === y ? 'selected' : ''}>${i}</option>`;
  }
  for (let i = 1; i <= 12; i++) {
    monthSel.innerHTML += `<option value="${i}" ${i === m ? 'selected' : ''}>${i}</option>`;
  }
  updateDayOptions(y, m, d);
  setTimeout(syncDateTriggers, 0);

  yearSel.addEventListener('change', () => updateDayOptions(
    parseInt(yearSel.value), parseInt(monthSel.value)
  ));
  monthSel.addEventListener('change', () => updateDayOptions(
    parseInt(yearSel.value), parseInt(monthSel.value)
  ));
}

function updateDayOptions(year, month, selectedDay) {
  const daySel = document.getElementById('inputDeadlineDay');
  const current = selectedDay || parseInt(daySel.value) || 1;
  const maxDay = new Date(year, month, 0).getDate();
  daySel.innerHTML = '';
  for (let i = 1; i <= maxDay; i++) {
    daySel.innerHTML += `<option value="${i}" ${i === current ? 'selected' : ''}>${i}</option>`;
  }
}

function getSelectedDeadline() {
  const y = document.getElementById('inputDeadlineYear').value;
  const m = String(document.getElementById('inputDeadlineMonth').value).padStart(2, '0');
  const d = String(document.getElementById('inputDeadlineDay').value).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resetDateSelects() {
  const today = getKSTDateParts();
  document.getElementById('inputDeadlineYear').value = today.y;
  document.getElementById('inputDeadlineMonth').value = today.m;
  updateDayOptions(today.y, today.m, today.d);
  setTimeout(syncDateTriggers, 0);
}

// ===== 지도 초기화 =====
function initMap() {
  map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(37.5040, 127.0300),
    zoom: 14,
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
        logoContainer.style.bottom = '86px';
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

  naver.maps.Event.addListener(map, 'zoom_changed', () => {
    if (window.innerWidth > 640) closePcCard();
  });

  // 지도 밖 영역 클릭 시 PC 카드 닫기
  document.addEventListener('click', (e) => {
    if (!openPcCardPlaceId) return;
    if (e.target.closest('.map-pin')) return;
    if (e.target.closest('#pcCard')) return;
    if (e.target.closest('#map') && !e.target.closest('.mobile-search-bar') && !e.target.closest('.btn-my-location')) return;
    closePcCard();
  });

  initDateSelects();
  renderAll();
  initSidebarScrollExpand();
  initSidebarSwipeToDismiss();
  initSheetSwipeToDismiss();
  tryInitialLocation();
  showBannerPopup();
}

// 최초 진입 시 내 위치로 지도 중심 이동 (권한 거부/실패 시 기본 위치 유지)
function tryInitialLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      map.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
      map.setZoom(15);
      renderSidebar();
    },
    () => {},
    { timeout: 5000 }
  );
}

// ===== 공지/이벤트 배너 팝업 =====
function getActiveBanner() {
  const today = getKSTTodayUTC();
  return banners.find(b => deadlineToUTC(b.startDate) <= today && today <= deadlineToUTC(b.endDate));
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
  img.onclick = () => { if (banner.linkUrl) window.open(banner.linkUrl, '_blank'); };
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

// ===== 마커 렌더 =====
function renderMarkers() {
  if (markerCluster) { markerCluster.setMap(null); markerCluster = null; }
  markers.forEach(m => m.setMap(null));
  markers = [];
  markerMap = {};
  selectedMarkerId = null;

  places.forEach(place => {
    const active = hasActiveCampaign(place.id);
    const icon = getCategoryPin(place.category);

    // 활성 캠페인 없으면 마커 미노출
    if (!active) return;

    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(place.lat, place.lng),
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

  const allChannels = [...new Set(active.flatMap(c => c.channels))];
  const channelIconsHtml = allChannels.map(ch =>
    CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}" style="border-radius:4px;display:block;">` : ''
  ).join('');

  const founderHtml = place.founderNickname ? `
    <div class="iw-founder">
      <span class="iw-founder-label">최초제보자</span>
      <div class="iw-founder-right">
        <img src="image/ic_workspace_premium_24.svg" width="24" height="24" alt="">
        <div class="iw-founder-name-group">
          ${place.founderUrl
            ? `<a class="iw-founder-name" href="${place.founderUrl}" target="_blank">${place.founderNickname}</a><img src="image/ic_chevron_right_blue.svg" class="iw-founder-chevron" alt="">`
            : `<span class="iw-founder-name">${place.founderNickname}</span>`}
        </div>
      </div>
    </div>` : '';

  const campaignsHtml = active.length > 0
    ? active.map((c, i) => {
        const dl = getDeadlineText(c.deadline);
        const ddayHtml = dl ? `<span class="iw-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : '';
        const color = getPlatformColor(c.platform);

        let daysHtml = '';
        if (c.operatingDays !== undefined) {
          const daysFormatted = ALL_DAYS.map(d => {
            const isActive = c.operatingDays.includes(d);
            return `<span style="color:${isActive ? '#000' : '#ccc'}">${d}</span>`;
          }).join(' ');
          const holidayBadge = c.excludeHoliday ? ` <span style="color:#aaa">/ 공휴일 불가</span>` : '';
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
              ? `<a class="iw-reporter-link" href="${reporterUrl}" target="_blank">${c.reporterNickname}</a><img src="image/ic_chevron_right_gray.svg" style="display:block;flex-shrink:0;" alt="">`
              : `<span class="iw-info-value">${c.reporterNickname}</span>`}
          </div>` : '';

        const divider = i > 0 ? '<div class="iw-divider"></div>' : '';

        return `
          ${divider}
          <div class="iw-campaign">
            <div class="iw-campaign-header">
              <div style="flex:1;min-width:0;">
                <span class="iw-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
              </div>
              ${ddayHtml}
            </div>
            <p class="iw-content">${c.content}</p>
            <div class="iw-info-rows">${daysHtml}${hoursHtml}${reporterHtml}</div>
          </div>`;
      }).join('')
    : '<div class="iw-empty">현재 모집 중인 캠페인이 없어요</div>';

  return `
    <div class="info-window">
      <div class="iw-place">
        <div class="iw-name-row">
          <div class="iw-name-text-group">
            <span class="iw-name">${place.name}</span>
            <div class="iw-channels">${channelIconsHtml}</div>
          </div>
          <button class="pc-card-close" onclick="closePcCard()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 3L13 13M13 3L3 13" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="iw-address">${place.address}</div>
      </div>
      ${founderHtml ? `<div class="iw-meta-founder">${founderHtml}<div class="iw-divider"></div></div>` : '<div class="iw-divider iw-divider-top"></div>'}
      <div class="iw-campaigns-wrap">${campaignsHtml}</div>
    </div>`;
}

function createMobileDetailContent(place) {
  const active = getActiveCampaigns(place.id);

  // 채널 아이콘
  const allChannels = [...new Set(active.flatMap(c => c.channels))];
  const channelIconsHtml = allChannels.map(ch =>
    CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}">` : ''
  ).join('');

  // 최초제보
  const founderHtml = place.founderNickname ? `
    <div class="detail-founder">
      <span class="detail-founder-label">최초제보자</span>
      <div class="detail-founder-right">
        <img src="image/ic_workspace_premium_24.svg" width="24" height="24" alt="" class="detail-founder-icon-img">
        <div class="detail-founder-name-group">
          ${place.founderUrl
            ? `<a class="detail-founder-link" href="${place.founderUrl}" target="_blank">${place.founderNickname}</a><img src="image/ic_chevron_right_blue.svg" class="detail-founder-chevron" alt="">`
            : `<span class="detail-founder-link">${place.founderNickname}</span>`}
        </div>
      </div>
    </div>` : '';

  // 캠페인 카드
  const ALL_DAYS = ['월','화','수','목','금','토','일'];
  const WEEKEND = new Set(['토','일']);

  const campaignsHtml = active.map((c, i) => {
    const dl = getDeadlineText(c.deadline);
    const ddayHtml = dl ? `<span class="detail-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : '';
    const color = getPlatformColor(c.platform);

    // 요일 렌더
    let daysHtml = '';
    if (c.operatingDays !== undefined) {
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
          ? `<a class="detail-info-reporter-link" href="${reporterUrl}" target="_blank">${c.reporterNickname}</a><img src="image/ic_chevron_right_gray.svg" class="detail-reporter-chevron" alt="">`
          : `<span class="detail-info-value">${c.reporterNickname}</span>`}
      </div>` : '';

    const divider = i > 0 ? '<div class="detail-divider"></div>' : '';

    return `
      ${divider}
      <div class="detail-campaign">
        <div class="detail-campaign-header">
          <div class="detail-campaign-tag-wrap">
            <span class="detail-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
          </div>
          ${ddayHtml}
        </div>
        <p class="detail-content">${c.content}</p>
        <div class="detail-info-rows">${daysHtml}${hoursHtml}${reporterHtml}</div>
      </div>`;
  }).join('');

  return `
    <div class="detail-fixed">
      <div class="detail-place">
        <div class="detail-name-row">
          <span class="detail-name">${place.name}</span>
          <div class="detail-channels">${channelIconsHtml}</div>
        </div>
        <div class="detail-address">${place.address}</div>
      </div>
      ${founderHtml ? `<div class="detail-meta-founder">${founderHtml}<div class="detail-divider"></div></div>` : '<div class="detail-divider detail-divider-top"></div>'}
    </div>
    <div class="detail-scroll">
      <div class="detail-campaigns-wrap">
        ${campaignsHtml}
      </div>
    </div>`;
}

// ===== 사이드바 렌더 =====
const CHANNEL_ICONS = {
  '블로그': 'image/ic_naver_blog_20.png',
  '클립': 'image/ic_clip_20.png',
  '인스타그램': 'image/ic_instagram_20.png',
  '유튜브': 'image/ic_youtube_20.png',
};

function renderSidebar() {
  const list = document.getElementById('campaignList');
  const countEl = document.getElementById('campaignCount');

  const bounds = map ? map.getBounds() : null;
  const visiblePlaces = bounds
    ? places.filter(p => bounds.hasLatLng(new naver.maps.LatLng(p.lat, p.lng)))
    : places;

  const activePlaces = visiblePlaces.filter(p => hasActiveCampaign(p.id));
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

  list.innerHTML = activePlaces.map(place => {
    const active = getActiveCampaigns(place.id);
    const earliest = active.reduce((min, c) => new Date(c.deadline) < new Date(min.deadline) ? c : min);
    const dl = getDeadlineText(earliest.deadline);

    // 채널 아이콘 (중복 제거)
    const channels = [...new Set(active.flatMap(c => c.channels))];
    const channelIconsHtml = channels.map(ch =>
      CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}">` : ''
    ).join('');

    // 캠페인 행들
    const campaignsHtml = active.map(c => {
      const color = getPlatformColor(c.platform);
      return `
        <div class="sb-campaign">
          <span class="sb-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
          <span class="sb-content">${c.content}</span>
        </div>`;
    }).join('');

    return `
      <div class="sb-item" onclick="focusPlace(${place.id})">
        <div class="sb-row-name">
          <span class="sb-name">${place.name}</span>
          <div class="sb-channels">${channelIconsHtml}</div>
          ${dl ? `<span class="sb-deadline ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : ''}
        </div>
        <div class="sb-address">${place.address}</div>
        ${campaignsHtml}
      </div>`;
  }).join('');
}

function moveToMyLocation() {
  if (!navigator.geolocation) { showToast('위치 정보를 사용할 수 없어요'); return; }
  const btn = document.querySelector('.btn-my-location');
  btn.style.opacity = '0.4';
  btn.disabled = true;
  const restore = () => { btn.style.opacity = ''; btn.disabled = false; };
  navigator.geolocation.getCurrentPosition(
    pos => {
      map.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
      map.setZoom(15);
      restore();
      renderSidebar();
    },
    () => { showToast('위치 권한을 허용해주세요'); restore(); }
  );
}

function focusPlace(placeId) {
  const place = places.find(p => p.id === placeId);
  if (!place) return;

  map.setCenter(new naver.maps.LatLng(place.lat, place.lng));
  map.setZoom(16);

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
  const latlng = new naver.maps.LatLng(place.lat, place.lng);
  const proj = map.getProjection();
  const mapWidth = document.getElementById('map').offsetWidth;
  // 카드(0~350px) 오른쪽인 390px에 항상 핀 고정 (화면 너비와 무관하게 카드-핀이 한 쌍으로 보이도록)
  const pinTargetX = 390;
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
  document.getElementById('pcCard').classList.add('visible');
  setSelectedMarker(place.id);
  panToCard(place);
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

  // 1. 등록된 매장명과 정확히 일치하면 그 장소로 바로 이동 + 카드 오픈
  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(query);
  const placeMatch = places.find(p => normalize(p.name) === nq);
  if (placeMatch) {
    setSelectedMarker(placeMatch.id);
    focusPlace(placeMatch.id);
    return;
  }

  // 2. 주소/지역명 검색 (geocode)
  function trySearch(q, fallback) {
    naver.maps.Service.geocode({ query: q }, function(status, response) {
      const items = response?.v2?.addresses;
      if (status === naver.maps.Service.Status.OK && items?.length) {
        map.setCenter(new naver.maps.LatLng(parseFloat(items[0].y), parseFloat(items[0].x)));
        map.setZoom(15);
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
function toggleBottomSheet(e) {
  if (window.innerWidth > 640) return;
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
}

// 리스트 스크롤 시 바텀시트 높이 자동 확장/축소
function initSidebarScrollExpand() {
  const list = document.getElementById('campaignList');
  if (!list) return;
  list.addEventListener('scroll', () => {
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
let existingResultsVisibleCount = 10;
const EXISTING_RESULTS_PAGE_SIZE = 10;

function renderActivePlaceCampaigns(placeId) {
  const today = getKSTTodayUTC();
  const active = campaigns.filter(c => c.placeId === placeId && !c.hidden && deadlineToUTC(c.deadline) >= today);
  if (!active.length) {
    return '<div class="place-campaign-preview"><div class="place-campaign-preview-empty">현재 진행중인 협찬이 없어요. 새 협찬을 등록해주세요.</div></div>';
  }
  const itemsHtml = active.map(c => {
    const dl = getDeadlineText(c.deadline);
    const color = getPlatformColor(c.platform);
    return `
      <div class="place-campaign-preview-item">
        <span class="place-campaign-tag" style="background:${color}29;color:${color}">${c.platform}</span>
        <span class="place-campaign-content">${c.content}</span>
        ${dl ? `<span class="place-campaign-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : ''}
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
  existingResultsVisibleCount = EXISTING_RESULTS_PAGE_SIZE;

  listEl.innerHTML = '<div class="search-hint">검색 중...</div>';

  fetch('/api/search-place?query=' + encodeURIComponent(q))
    .then(res => res.ok ? res.json() : [])
    .catch(() => [])
    .then(items => {
      lastNaverResults = items;
      renderPlaceResults();
    });
}

function loadMoreExistingResults() {
  existingResultsVisibleCount += EXISTING_RESULTS_PAGE_SIZE;
  renderPlaceResults();
}

function renderPlaceResults() {
  const listEl = document.getElementById('placeResultsList');
  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(lastSearchQuery);
  const allExistingMatches = places.filter(p => {
    const np = normalize(p.name);
    return np.includes(nq) || nq.includes(np);
  });
  const existingMatches = allExistingMatches.slice(0, existingResultsVisibleCount);

  const existingRows = existingMatches.map(p => {
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
  }).join('');

  const moreButtonHtml = allExistingMatches.length > existingResultsVisibleCount
    ? `<div class="place-result-more-wrap"><div class="place-result-more" onclick="loadMoreExistingResults()">더보기</div></div>`
    : '';

  const naverRows = lastNaverResults.map((item, i) => {
    const key = `naver:${i}`;
    const selected = modalSelectedResultKey === key;
    const addr = (item.roadAddress || item.address).replace(/'/g, "\\'");
    const name = item.name.replace(/'/g, "\\'");
    return `
      <div class="place-result-item ${selected ? 'selected' : ''}" onclick="selectNaverPlace(${i}, '${name}', '${addr}')">
        <div class="place-result-info">
          <div class="place-result-name">${item.name}</div>
          <div class="place-result-addr">${item.roadAddress || item.address}</div>
        </div>
        <span class="place-result-check ${selected ? 'selected' : ''}">✓</span>
      </div>`;
  }).join('');

  if (!existingRows && !naverRows) {
    listEl.innerHTML = '<div class="search-hint error">검색 결과가 없어요. 매장명을 다시 확인해주세요.</div>';
    return;
  }
  listEl.innerHTML = existingRows + moreButtonHtml + naverRows;
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

    // 가까운 좌표에 이미 등록된 장소 확인 (50m 이내)
    const sameAddr = places.find(p => {
      const dLat = (p.lat - lat) * 111000;
      const dLng = (p.lng - lng) * 88000;
      return Math.sqrt(dLat * dLat + dLng * dLng) < 50;
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
      <p>무협맵(이하 '서비스')은 이용자의 개인정보를 중요시하며, 「개인정보 보호법」을 준수하고 있습니다.</p>
      <div class="about-section">
        <div class="about-section-title">1. 수집하는 개인정보 항목</div>
        <p class="about-desc">서비스는 협찬 제보 시 닉네임, 이메일(선택) 등 최소한의 정보를 수집합니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">2. 개인정보의 수집 및 이용 목적</div>
        <p class="about-desc">제보 내용 확인, 문의 응대, 부정 이용 방지를 위한 목적으로만 이용됩니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">3. 개인정보의 보유 및 이용 기간</div>
        <p class="about-desc">수집된 정보는 목적 달성 후 지체 없이 파기하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">4. 개인정보의 제3자 제공</div>
        <p class="about-desc">서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.</p>
      </div>
      <div class="about-legal">
        <p>본 방침은 서비스 운영상 필요에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다.</p>
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
        <p class="about-desc">서비스는 여러 플랫폼에 흩어진 협찬 정보를 지도 위에서 탐색할 수 있도록 도와주는 정보 제공 서비스이며, 협찬의 신청·진행·이행에 직접 관여하지 않습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제3조 (이용자의 의무)</div>
        <p class="about-desc">이용자는 협찬 정보 제보 시 사실에 기반한 정확한 정보를 등록해야 하며, 허위 정보 등록 시 서비스 이용이 제한될 수 있습니다.</p>
      </div>
      <div class="about-section">
        <div class="about-section-title">제4조 (책임의 제한)</div>
        <p class="about-desc">서비스에 게시된 협찬 정보는 이용자의 제보를 기반으로 하며, 정보의 정확성·최신성에 대해 서비스는 보증하지 않습니다. 협찬 신청 및 진행과 관련한 권리와 책임은 각 플랫폼 및 업체에 있습니다.</p>
      </div>
      <div class="about-legal">
        <p>본 약관은 서비스 운영상 필요에 따라 변경될 수 있으며, 변경 시 서비스 내 공지합니다.</p>
      </div>`
  }
};

function openPolicy(type) {
  const data = POLICY_CONTENT[type];
  if (!data) return;
  document.getElementById('policyTitle').textContent = data.title;
  document.getElementById('policyBody').innerHTML = data.body;
  document.getElementById('policyOverlay').classList.add('open');
}
function closePolicy() {
  document.getElementById('policyOverlay').classList.remove('open');
}

// ===== 우측 슬라이드 메뉴 =====
function openSideMenu() {
  document.getElementById('sideMenuOverlay').classList.add('open');
}
function closeSideMenu() {
  document.getElementById('sideMenuOverlay').classList.remove('open');
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
  if (window.innerWidth > 640 && pcTabActive === 'about') {
    switchPcTab('campaigns');
  }
}

// ===== 신고 모달 =====
let reportSelectedCampaignId = null;
let reportSelectedReason = null;

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
function closeReportModal() {
  document.getElementById('reportOverlay').classList.remove('open');
  if (window.innerWidth > 640 && pcTabActive === 'reportissue') {
    switchPcTab('campaigns');
  }
}
function resetReportModal() {
  reportSelectedCampaignId = null;
  reportSelectedReason = null;
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

// 모바일 공통: 정적 .modal-header는 모바일에서 숨기고 .modal-scroll-header로 대체
function syncMobileModalHeader(modalSelector) {
  const mh = document.querySelector(modalSelector + ' .modal-header');
  if (mh) mh.style.display = window.innerWidth <= 640 ? 'none' : 'flex';
}

function searchReportTarget() {
  reportSelectedCampaignId = null;
  clearFieldError('reportTarget');
  renderReportResults();
}

function renderReportResults() {
  const q = document.getElementById('reportSearchInput').value.trim();
  const listEl = document.getElementById('reportResultsList');
  if (!q) { listEl.innerHTML = ''; return; }

  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(q);
  const matches = campaigns.filter(c => {
    if (c.hidden) return false;
    const place = places.find(p => p.id === c.placeId);
    if (!place) return false;
    return normalize(place.name).includes(nq);
  });

  if (!matches.length) {
    listEl.innerHTML = '<div class="search-hint error">검색 결과가 없어요. 매장명을 다시 확인해주세요.</div>';
    return;
  }

  listEl.innerHTML = matches.map(c => {
    const place = places.find(p => p.id === c.placeId);
    const selected = reportSelectedCampaignId === c.id;
    return `
      <div class="place-result-item ${selected ? 'selected' : ''}" onclick="selectReportTarget(${c.id})">
        <div class="place-result-info">
          <div class="place-result-name">${place.name} · ${c.platform}</div>
          <div class="place-result-addr">${c.content}</div>
        </div>
        <span class="place-result-check ${selected ? 'selected' : ''}">✓</span>
      </div>`;
  }).join('');
}

function selectReportTarget(campaignId) {
  reportSelectedCampaignId = reportSelectedCampaignId === campaignId ? null : campaignId;
  clearFieldError('reportTarget');
  renderReportResults();
}

function selectReportReason(select) {
  reportSelectedReason = select.value;
  clearFieldError('reportReason');
}

function submitReport() {
  let valid = true;
  if (!reportSelectedCampaignId) { showFieldError('reportTarget'); valid = false; }
  if (!reportSelectedReason) { showFieldError('reportReason'); valid = false; }
  if (!valid) return;

  const detail = document.getElementById('reportDetail').value.trim();
  fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: reportSelectedCampaignId, reason: reportSelectedReason, detail })
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

  pcTabActive = tab;
  campaignsTab?.classList.toggle('active', tab === 'campaigns');
  reportTab?.classList.toggle('active', tab === 'report');
  reportIssueTab?.classList.toggle('active', tab === 'reportissue');
  aboutTab?.classList.toggle('active', tab === 'about');
  document.body.classList.toggle('pc-report-mode', tab === 'report');
  document.body.classList.toggle('pc-reportissue-mode', tab === 'reportissue');
  document.body.classList.toggle('pc-about-mode', tab === 'about');

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
  if (window.innerWidth > 640 && pcTabActive === 'report') {
    pcTabActive = 'campaigns';
    document.body.classList.remove('pc-report-mode');
    document.getElementById('tabCampaigns')?.classList.add('active');
    document.getElementById('tabReport')?.classList.remove('active');
  }
}

function resetModal() {
  clearAllFieldErrors();
  modalSelectedPlaceId = null; modalIsNewPlace = true;
  modalSelectedLat = null; modalSelectedLng = null; modalSelectedAddress = '';
  modalSelectedResultKey = null; lastNaverResults = [];
  lastSearchQuery = ''; existingResultsVisibleCount = EXISTING_RESULTS_PAGE_SIZE;
  document.getElementById('step1').style.display = 'flex';
  document.getElementById('step2').style.display = 'none';
  ['inputName','inputContent','inputHours','inputNickname','inputEmail']
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
  resetDateSelects();
  document.getElementById('placeResultsList').innerHTML = '';
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#modalOverlay .btn-input-clear').forEach(b => b.classList.remove('show'));
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
    document.getElementById('founderSectionDesc').textContent = '마감일까지 이 캠페인 제보자로 표시돼요';
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
  const deadline = getSelectedDeadline();
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
  if (!valid) return;

  _submittingCampaign = true;
  const submitBtn = document.querySelector('.btn-submit');
  if (submitBtn) submitBtn.disabled = true;

  const reporterUrl = buildReporterUrl();
  const reporterNickname = document.getElementById('inputNickname').value.trim();
  const reporterEmail = document.getElementById('inputEmail').value.trim();

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
        founderEmail: reporterEmail,
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
    if (place) place.category = category;
  }

  const newCampaign = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId, channels, platform, content, deadline, link,
      operatingDays: [...document.querySelectorAll('.day-btn.active')].map(b => b.textContent),
      excludeHoliday: document.getElementById('holidayExclude')?.classList.contains('active') ?? false,
      operatingHours: document.getElementById('inputHours').value.trim(),
      reporterNickname, reporterEmail, reporterUrl, source: 'user'
    })
  }).then(r => r.json());
  campaigns.push(newCampaign);
  updateStatCount();

  closeModal();
  renderAll();

  const place = places.find(p => p.id === placeId);
  map.setCenter(new naver.maps.LatLng(place.lat, place.lng));
  map.setZoom(16);
  showToast(`${place.name} 제보 완료!`);
  } finally {
    _submittingCampaign = false;
    if (submitBtn) submitBtn.disabled = false;
  }
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
    return place ? { nick: c.source === 'user' ? (c.reporterNickname || '익명') : '익명', place: place.name, createdAt: c.createdAt || '' } : null;
  };
  const userOnes = campaigns.filter(c => c.source === 'user' && !c.hidden).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const otherOnes = campaigns.filter(c => c.source !== 'user' && !c.hidden).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
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

function showLiveBubble(data) {
  const bubble = document.getElementById('liveBubble');
  const text = document.getElementById('liveBubbleText');
  if (!bubble || !text) return;
  if (_liveBubbleTimer) clearTimeout(_liveBubbleTimer);
  bubble.classList.remove('show');
  setTimeout(() => {
    const particle = getEulReul(data.place);
    text.innerHTML = `${data.nick}님이 <strong>${data.place}</strong>${particle}<br>추가했어요!`;
    bubble.classList.add('show');
    playCharacterAnim();
    _liveBubbleTimer = setTimeout(() => bubble.classList.remove('show'), 5000);
  }, 100);
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
function openNaverMap(name, address) {
  const webUrl = `https://map.naver.com/v5/search/${encodeURIComponent(name)}`;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    // 앱 딥링크 시도
    const appUrl = `nmap://search?query=${encodeURIComponent(name)}&appname=muhyeop-map`;
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
  sheet.style.transform = '';
  sheet.classList.add('show');
  overlay.classList.add('show');
  setSelectedMarker(place.id);
  // 핀을 바텀시트 위 영역 중앙으로 이동 (시트에 가리지 않게 위로 올림)
  const proj = map.getProjection();
  if (proj) {
    const off = proj.fromCoordToOffset(new naver.maps.LatLng(place.lat, place.lng));
    off.y += 150;
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

  function startDrag(y) {
    if (window.innerWidth > 640) return false;
    if (!sidebar.classList.contains('expanded')) return false;
    startY = y; currentY = y; dragging = true;
    sidebar.style.transition = 'none';
    return true;
  }

  function moveDrag(y) {
    if (!dragging) return;
    currentY = y;
    const delta = currentY - startY;
    if (delta < 0) return;
    sidebar.style.transform = `translateY(${delta}px)`;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const delta = currentY - startY;
    if (delta > 80) {
      // peek(헤더 바) 상태로 복귀 — transform만 애니메이션(GPU 가속)해 부드럽게, 끝나면 height를 한 프레임에 교체
      const arrow = document.getElementById('sidebarArrow');
      if (arrow) arrow.textContent = '︿';
      setNaverLogoVisible(true);
      const PEEK_H = 78;
      const slideTo = Math.max(0, sidebar.offsetHeight - PEEK_H);
      sidebar.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      sidebar.style.transform = `translateY(${slideTo}px)`;
      setTimeout(() => {
        // 같은 화면 위치에서 height 축소 + transform 리셋을 원자적으로 교체 → 점프 없음
        sidebar.style.transition = 'none';
        sidebar.classList.remove('expanded');
        sidebar.classList.remove('expanded-full');
        sidebar.style.transform = '';
        const list = document.getElementById('campaignList');
        if (list) list.scrollTop = 0;
        requestAnimationFrame(() => { sidebar.style.transition = ''; });
      }, 300);
    } else {
      sidebar.style.transition = 'none';
      sidebar.style.transform = '';
      requestAnimationFrame(() => { sidebar.style.transition = ''; });
    }
  }

  // 헤더 영역
  header.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientY), { passive: true });
  header.addEventListener('touchmove', (e) => moveDrag(e.touches[0].clientY), { passive: true });
  header.addEventListener('touchend', endDrag);

  // 리스트 영역: 맨 위에서 아래로 당길 때만 닫기
  const list = document.getElementById('campaignList');
  list.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = false;
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    const y = e.touches[0].clientY;
    const delta = y - startY;
    // 맨 위에서 아래로 당길 때만 dismiss 처리
    if (list.scrollTop <= 0 && delta > 0 && sidebar.classList.contains('expanded')) {
      if (!dragging) {
        dragging = true;
        sidebar.style.transition = 'none';
      }
      e.preventDefault();
      currentY = y;
      sidebar.style.transform = `translateY(${delta}px)`;
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
    // 컨텐츠 스크롤 중이면 무시 (맨 위일 때만 드래그 허용)
    if (e.target.closest('.mobile-sheet-content') && content.scrollTop > 0) return;
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
  if (statCountEl) statCountEl.textContent = campaigns.length.toLocaleString();
}

document.addEventListener('DOMContentLoaded', setupClearButtons);

document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1 && !e.target.closest('#map')) e.preventDefault();
}, { passive: false });

window.addEventListener('load', async function() {
  await loadInitialData();
  if (!document.getElementById('map')) return;
  updateStatCount();
  initMap();
  setTimeout(function() { window.dispatchEvent(new Event('resize')); }, 100);
  startLiveAlerts();
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

function updateUrlPlatform(platform) {
  const rowEl = document.getElementById('inputUrlIdRow');
  const prefixEl = document.getElementById('inputUrlDomainPrefix');
  const idInput = document.getElementById('inputUrlId');
  const iconEl = document.getElementById('inputUrlPlatformIcon');
  if (!rowEl || !prefixEl || !idInput || !iconEl) return;
  const domain = URL_PLATFORM_DOMAINS[platform] || '';

  rowEl.style.display = domain ? 'flex' : 'none';
  prefixEl.textContent = domain;
  idInput.value = '';

  // 바텀시트 닫힘 애니메이션(300ms) 끝난 뒤 입력칸이 화면에 들어오도록 스크롤
  if (domain) {
    setTimeout(() => rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 320);
  }

  const icon = URL_PLATFORM_ICONS[platform];
  if (icon) { iconEl.src = icon; iconEl.style.display = 'block'; }
  else { iconEl.removeAttribute('src'); iconEl.style.display = 'none'; }
}

function buildReporterUrl() {
  const platform = document.getElementById('inputUrlPlatform').value;
  const id = document.getElementById('inputUrlId').value.trim();
  const domain = URL_PLATFORM_DOMAINS[platform];
  if (!domain || !id) return '';
  return `https://${domain}${id}`;
}

// ===== 커스텀 셀렉트 바텀시트 =====
let _selectSheetTarget = null;

function openSelectSheet(selectId, title) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  _selectSheetTarget = selectId;

  // 셀렉트가 속한 모달로 바텀시트를 이동시켜 해당 모달 영역 안에 정확히 표시되도록 함
  const hostModal = sel.closest('.modal');
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

  if (selectId === 'inputUrlPlatform') updateUrlPlatform(value);

  // 오류 메시지 클리어
  if (selectId.startsWith('inputDeadline')) {
    clearFieldError('deadline');
    const y = parseInt(document.getElementById('inputDeadlineYear').value);
    const m = parseInt(document.getElementById('inputDeadlineMonth').value);
    if (selectId === 'inputDeadlineYear' || selectId === 'inputDeadlineMonth') {
      updateDayOptions(y, m);
      syncDateTriggers();
    }
  } else if (selectId === 'inputPlatform') {
    if (!modalIsNewPlace && hasPlatformAlready(modalSelectedPlaceId, value)) {
      document.getElementById('inputPlatformError').textContent = `이미 ${value}로 등록된 협찬이 있어요. 다른 플랫폼을 선택해주세요.`;
      showFieldError('inputPlatform');
    } else {
      clearFieldError('inputPlatform');
    }
  } else {
    clearFieldError(selectId);
  }

  closeSelectSheet();
  sel.dispatchEvent(new Event('change'));
}

function syncDateTriggers() {
  ['inputDeadlineYear', 'inputDeadlineMonth', 'inputDeadlineDay'].forEach(id => {
    const sel = document.getElementById(id);
    const valueEl = document.getElementById(id + 'Value');
    if (sel && valueEl && sel.value) {
      const opt = sel.options[sel.selectedIndex];
      valueEl.textContent = opt ? opt.textContent : sel.value;
      valueEl.classList.add('selected');
    }
  });
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
