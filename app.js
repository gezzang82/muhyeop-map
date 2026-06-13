// ===== 무협맵 app.js =====

// 데이터 구조: 장소(Places) + 캠페인(Campaigns)
let places = [
  { id: 1, name: "스시코우지 강남", address: "서울 강남구 테헤란로 152", lat: 37.5000, lng: 127.0370, category: "음식점", founderNickname: "맛집탐험가", founderUrl: "https://blog.naver.com/example1" },
  { id: 2, name: "올리브영 강남본점", address: "서울 강남구 강남대로 422", lat: 37.5012, lng: 127.0247, category: "뷰티", founderNickname: "뷰티로그", founderUrl: "https://blog.naver.com/example2" },
  { id: 3, name: "카페 노티드 청담", address: "서울 강남구 압구정로 428", lat: 37.5247, lng: 127.0430, category: "카페", founderNickname: "카페투어러", founderUrl: "https://instagram.com/example3" },
  { id: 4, name: "젝시믹스 강남점", address: "서울 강남구 강남대로 390", lat: 37.4975, lng: 127.0280, category: "의류", founderNickname: "", founderUrl: "" },
  { id: 5, name: "이니스프리 강남점", address: "서울 강남구 강남대로 438", lat: 37.5020, lng: 127.0260, category: "뷰티", founderNickname: "스킨케어러", founderUrl: "https://blog.naver.com/example5" },
  { id: 6, name: "할리스 압구정점", address: "서울 강남구 압구정로 20길 10", lat: 37.5270, lng: 127.0290, category: "카페", founderNickname: "카페순례자", founderUrl: "https://instagram.com/example6" },
  { id: 7, name: "메가커피 성수점", address: "서울 성동구 성수이로 78", lat: 37.5447, lng: 127.0557, category: "카페", founderNickname: "커피러버", founderUrl: "https://blog.naver.com/example7" },
  { id: 8, name: "ABC마트 홍대점", address: "서울 마포구 양화로 151", lat: 37.5573, lng: 126.9241, category: "의류", founderNickname: "스니커즈헌터", founderUrl: "https://instagram.com/example8" },
  { id: 9, name: "교촌치킨 이태원점", address: "서울 용산구 이태원로 180", lat: 37.5346, lng: 126.9938, category: "음식점", founderNickname: "치킨러버", founderUrl: "" },
  { id: 10, name: "네이처리퍼블릭 명동점", address: "서울 중구 명동길 53", lat: 37.5633, lng: 126.9820, category: "뷰티", founderNickname: "명동뷰티", founderUrl: "https://blog.naver.com/example10" },
  { id: 11, name: "스타벅스 선릉역점", address: "서울 강남구 테헤란로 310", lat: 37.5040, lng: 127.0490, category: "카페", founderNickname: "", founderUrl: "" },
  { id: 12, name: "이마트24 건대점", address: "서울 광진구 능동로 120", lat: 37.5403, lng: 127.0696, category: "기타", founderNickname: "편의점탐방", founderUrl: "" },
  { id: 13, name: "삼청각", address: "서울 성북구 북악산로 65", lat: 37.5917, lng: 126.9832, category: "음식점", founderNickname: "고궁맛집", founderUrl: "https://blog.naver.com/example13" },
  { id: 14, name: "무신사 스토어 홍대", address: "서울 마포구 어울마당로 35", lat: 37.5540, lng: 126.9226, category: "의류", founderNickname: "패션피플", founderUrl: "https://instagram.com/example14" },
  { id: 15, name: "아워홈 코엑스점", address: "서울 강남구 영동대로 513", lat: 37.5126, lng: 127.0590, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 16, name: "롭스 홍대점", address: "서울 마포구 와우산로 13", lat: 37.5560, lng: 126.9210, category: "뷰티", founderNickname: "홍대뷰티", founderUrl: "https://blog.naver.com/example16" },
  { id: 17, name: "투썸플레이스 잠실점", address: "서울 송파구 올림픽로 240", lat: 37.5135, lng: 127.1028, category: "카페", founderNickname: "디저트마니아", founderUrl: "https://instagram.com/example17" },
  { id: 18, name: "왓슨스 신촌점", address: "서울 서대문구 신촌로 83", lat: 37.5553, lng: 126.9370, category: "뷰티", founderNickname: "", founderUrl: "" },
  { id: 19, name: "파리바게뜨 여의도점", address: "서울 영등포구 국제금융로 10", lat: 37.5210, lng: 126.9241, category: "카페", founderNickname: "빵순이", founderUrl: "https://blog.naver.com/example19" },
  { id: 20, name: "GS25 서울숲점", address: "서울 성동구 뚝섬로 273", lat: 37.5436, lng: 127.0439, category: "기타", founderNickname: "편의점왕", founderUrl: "" }
];

let campaigns = [
  {
    id: 1, placeId: 1, platform: "레뷰", channels: ["블로그"],
    content: "오마카세 1인 체험 (80,000원 상당)",
    deadline: "2026-06-25", link: "https://www.revu.net",
    operatingDays: ["화", "수", "목", "금", "토"], operatingHours: "12:00~22:00",
    reporterNickname: "맛집탐험가", reporterBlog: "https://blog.naver.com/example1", reporterInstagram: ""
  },
  {
    id: 2, placeId: 2, platform: "리뷰노트", channels: ["블로그", "클립"],
    content: "신제품 스킨케어 체험",
    deadline: "2026-06-20", link: "https://www.reviewnote.co.kr",
    operatingDays: ["월", "화", "수", "목", "금", "토", "일"], operatingHours: "10:00~22:00",
    reporterNickname: "뷰티로그", reporterBlog: "https://blog.naver.com/example2", reporterInstagram: ""
  },
  {
    id: 3, placeId: 3, platform: "미블", channels: ["인스타그램"],
    content: "시즌 한정 음료 2잔",
    deadline: "2026-06-30", link: "https://mrble.net",
    operatingDays: [], operatingHours: "09:00~22:00",
    reporterNickname: "카페투어러", reporterBlog: "", reporterInstagram: "https://instagram.com/example3"
  },
  {
    id: 4, placeId: 4, platform: "강남맛집", channels: ["블로그"],
    content: "신상 레깅스 착용 리뷰",
    deadline: "2026-06-15", link: "https://www.gangnamfood.co.kr",
    operatingDays: ["월", "화", "수", "목", "금"], operatingHours: "",
    reporterNickname: "", reporterUrl: ""
  },
  {
    id: 7, placeId: 1, platform: "리뷰노트", channels: ["블로그", "클립"],
    content: "오마카세 2인 코스 체험 (150,000원 상당)",
    deadline: "2026-06-28", link: "https://www.reviewnote.co.kr",
    operatingDays: ["화", "수", "목", "금", "토"], operatingHours: "12:00~22:00",
    reporterNickname: "", reporterUrl: ""
  },
  {
    id: 5, placeId: 5, platform: "레뷰", channels: ["블로그"],
    content: "수분크림 + 토너 패드 세트 체험",
    deadline: "2026-05-31", link: "https://www.revu.net",
    operatingDays: ["월", "화", "수", "목", "금", "토", "일"], operatingHours: "10:00~21:00",
    reporterNickname: "스킨케어러", reporterUrl: "https://blog.naver.com/example5"
  },
  {
    id: 6, placeId: 6, platform: "미블", channels: ["인스타그램"],
    content: "시그니처 음료 2잔 + 케이크 1조각",
    deadline: "2026-06-01", link: "https://mrble.net",
    operatingDays: [], operatingHours: "08:00~22:00",
    reporterNickname: "카페순례자", reporterUrl: "https://instagram.com/example6"
  },
  { id: 8,  placeId: 7,  platform: "레뷰",      channels: ["블로그"],             content: "아메리카노 2잔 무료 체험",          deadline: "2026-07-10", link: "https://www.revu.net",              operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "08:00~22:00", reporterNickname: "커피러버",    reporterBlog: "https://blog.naver.com/example7",  reporterInstagram: "" },
  { id: 9,  placeId: 8,  platform: "디너의여왕", channels: ["인스타그램"],          content: "한정판 스니커즈 착용 리뷰",         deadline: "2026-07-05", link: "https://www.dinnersqueen.com",      operatingDays: [],                                   operatingHours: "11:00~21:00", reporterNickname: "스니커즈헌터", reporterBlog: "",                                  reporterInstagram: "https://instagram.com/example8" },
  { id: 10, placeId: 9,  platform: "강남맛집",   channels: ["블로그"],             content: "치킨 1마리 + 음료 2잔",            deadline: "2026-06-30", link: "https://www.gangnamfood.co.kr",     operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "16:00~01:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 11, placeId: 10, platform: "리뷰노트",   channels: ["블로그", "클립"],     content: "여름 신제품 선크림 세트",           deadline: "2026-07-15", link: "https://www.reviewnote.co.kr",      operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "명동뷰티",    reporterBlog: "https://blog.naver.com/example10",  reporterInstagram: "" },
  { id: 12, placeId: 11, platform: "미블",       channels: ["클립"],               content: "시즌 신메뉴 2종 체험",             deadline: "2026-07-20", link: "https://mrble.net",                 operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "07:00~23:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 13, placeId: 12, platform: "레뷰",       channels: ["블로그"],             content: "편의점 신상 도시락 3종 체험",       deadline: "2026-07-08", link: "https://www.revu.net",              operatingDays: [],                                   operatingHours: "24시간",      reporterNickname: "편의점탐방",   reporterBlog: "",                                  reporterInstagram: "" },
  { id: 14, placeId: 13, platform: "디너의여왕", channels: ["인스타그램"],          content: "궁중 코스 요리 2인 체험",          deadline: "2026-07-25", link: "https://www.dinnersqueen.com",      operatingDays: ["화","수","목","금","토","일"],      operatingHours: "12:00~22:00", reporterNickname: "고궁맛집",    reporterBlog: "https://blog.naver.com/example13",  reporterInstagram: "" },
  { id: 15, placeId: 14, platform: "강남맛집",   channels: ["블로그", "클립"],     content: "여름 신상 반바지 착용 리뷰",        deadline: "2026-07-01", link: "https://www.gangnamfood.co.kr",     operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "12:00~21:00", reporterNickname: "패션피플",    reporterBlog: "",                                  reporterInstagram: "https://instagram.com/example14" },
  { id: 16, placeId: 15, platform: "리뷰노트",   channels: ["블로그"],             content: "런치 세트 2인 무료 체험",           deadline: "2026-07-12", link: "https://www.reviewnote.co.kr",      operatingDays: ["월","화","수","목","금"],           operatingHours: "11:00~15:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 17, placeId: 16, platform: "미블",       channels: ["인스타그램"],          content: "여름 한정 스킨케어 3종 체험",       deadline: "2026-06-28", link: "https://mrble.net",                 operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "홍대뷰티",    reporterBlog: "https://blog.naver.com/example16",  reporterInstagram: "" },
  { id: 18, placeId: 17, platform: "레뷰",       channels: ["클립"],               content: "딸기 케이크 + 음료 세트",          deadline: "2026-07-18", link: "https://www.revu.net",              operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "디저트마니아", reporterBlog: "",                                  reporterInstagram: "https://instagram.com/example17" },
  { id: 19, placeId: 18, platform: "강남맛집",   channels: ["블로그"],             content: "여름 신상 선크림 2종 세트",         deadline: "2026-07-22", link: "https://www.gangnamfood.co.kr",     operatingDays: [],                                   operatingHours: "09:00~22:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 20, placeId: 19, platform: "디너의여왕", channels: ["블로그", "클립"],     content: "여름 한정 샌드위치 + 음료 세트",    deadline: "2026-07-30", link: "https://www.dinnersqueen.com",      operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "08:00~21:00", reporterNickname: "빵순이",      reporterBlog: "https://blog.naver.com/example19",  reporterInstagram: "" },
  { id: 21, placeId: 20, platform: "리뷰노트",   channels: ["블로그", "인스타그램"], content: "편의점 신상 디저트 5종 체험",       deadline: "2026-07-14", link: "https://www.reviewnote.co.kr",      operatingDays: [],                                   operatingHours: "24시간",      reporterNickname: "편의점왕",    reporterBlog: "",                                  reporterInstagram: "" },
  { id: 22, placeId: 1,  platform: "레뷰",       channels: ["블로그", "인스타그램"], content: "오마카세 1인 런치 코스 체험 (12만원 상당)", deadline: "2026-07-31", link: "https://www.revu.net", operatingDays: ["화","수","목","금","토"], operatingHours: "12:00~15:00", excludeHoliday: true, reporterNickname: "맛집탐험가", reporterBlog: "https://blog.naver.com/example1", reporterInstagram: "" }
];

let nextPlaceId = 21;
let nextCampaignId = 23;
let currentChannelFilter = '전체';

let map;
let markers = [];
let markerCluster = null;
let openInfoWindow = null;
let markerMap = {}; // placeId → { marker, infoWindow }

// 모달 상태
let modalSelectedPlaceId = null;
let modalIsNewPlace = true;
let modalSelectedLat = null;
let modalSelectedLng = null;
let modalSelectedAddress = "";

// ===== 상수 =====
const CATEGORY_ICONS = {
  '음식점': '🍽️', '카페': '☕', '뷰티': '💄',
  '숙박/여가': '🏨', '문화': '🎭', '의류': '👗',
  '안경/잡화': '👓', '기타': '📦'
};

const PLATFORM_COLORS = {
  '레뷰': '#1D9E75', '리뷰노트': '#185FA5', '미블': '#854F0B',
  '강남맛집': '#993556', '디너의여왕': '#E05C00', '기타': '#666666'
};

function getCategoryIcon(cat) { return CATEGORY_ICONS[cat] || '📍'; }
function getPlatformColor(p) { return PLATFORM_COLORS[p] || '#666666'; }

function getActiveCampaigns(placeId) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return campaigns.filter(c => {
    if (c.placeId !== placeId) return false;
    if (new Date(c.deadline) < today) return false;
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

function getDeadlineText(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(deadline) - today) / 86400000);
  if (diff < 0) return { text: '마감됨', urgent: false };
  if (diff === 0) return { text: '오늘 마감!', urgent: true };
  if (diff <= 3) return { text: `D-${diff}`, urgent: true };
  return { text: `D-${diff}`, urgent: false };
}

// ===== 날짜 셀렉트 초기화 =====
function initDateSelects() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();

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
  const today = new Date();
  document.getElementById('inputDeadlineYear').value = today.getFullYear();
  document.getElementById('inputDeadlineMonth').value = today.getMonth() + 1;
  updateDayOptions(today.getFullYear(), today.getMonth() + 1, today.getDate());
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
    mapDataControl: false
  });

  naver.maps.Event.addListener(map, 'click', () => {
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

  // 지도 밖 영역 클릭 시 인포창 닫기
  document.addEventListener('click', (e) => {
    if (!openInfoWindow) return;
    if (e.target.closest('.map-marker')) return; // 마커 클릭은 자체 처리
    if (e.target.closest('.info-window')) return; // 인포창 내부 클릭은 유지
    if (e.target.closest('#map') && !e.target.closest('.mobile-search-bar') && !e.target.closest('.btn-my-location')) return;
    openInfoWindow.close();
    openInfoWindow = null;
  });

  initDateSelects();
  renderAll();
  initSidebarScrollExpand();
  initSidebarSwipeToDismiss();
  initSheetSwipeToDismiss();
}

// ===== 마커 렌더 =====
function renderMarkers() {
  if (markerCluster) { markerCluster.setMap(null); markerCluster = null; }
  markers.forEach(m => m.setMap(null));
  markers = [];
  markerMap = {};

  places.forEach(place => {
    const active = hasActiveCampaign(place.id);
    const icon = getCategoryIcon(place.category);

    // 활성 캠페인 없으면 마커 미노출
    if (!active) return;

    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(place.lat, place.lng),
      icon: {
        content: `<div class="map-marker active">${icon}</div>`,
        anchor: new naver.maps.Point(20, 20)
      }
    });

    const infoWindow = new naver.maps.InfoWindow({
      content: createInfoContent(place),
      borderWidth: 0,
      backgroundColor: 'transparent',
      pixelOffset: new naver.maps.Point(0, -10),
      disableAnchor: true
    });

    naver.maps.Event.addListener(marker, 'click', () => {
      if (window.innerWidth <= 640) {
        // 모바일: 바텀시트
        openMobileSheet(place);
      } else {
        // PC: 인포윈도우
        if (openInfoWindow === infoWindow) {
          infoWindow.close(); openInfoWindow = null; return;
        }
        if (openInfoWindow) openInfoWindow.close();
        infoWindow.open(map, marker);
        openInfoWindow = infoWindow;
      }
    });

    markers.push(marker);
    markerMap[place.id] = { marker, infoWindow };
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
  const icon = getCategoryIcon(place.category);

  const campaignsHtml = active.length > 0
    ? active.map(c => {
        const dl = getDeadlineText(c.deadline);
        const dlHtml = dl ? `<span class="c-deadline ${dl.urgent ? 'urgent' : ''}">${dl.text}</span><span class="c-deadline-date">${c.deadline.replace(/-/g, '.')} 마감</span>` : '';
        const hoursHtml = c.operatingHours ? `<div class="c-hours">⏰ ${c.operatingHours}</div>` : '';
        const daysHtml = c.operatingDays?.length > 0 ? `<div class="c-days">📅 ${c.operatingDays.join(' ')}</div>` : '';
        const color = getPlatformColor(c.platform);
        const channelHtml = (c.channels && c.channels.length) ? c.channels.map(ch => `<span class="c-channel">${ch}</span>`).join('') : '';
        let reporterHtml = '';
        if (c.reporterNickname) {
          const nameHtml = c.reporterUrl
            ? `<a class="c-reporter-link" href="${c.reporterUrl}" target="_blank">${c.reporterNickname}</a>`
            : c.reporterNickname;
          reporterHtml = `<div class="c-reporter">🚩 ${nameHtml} 제보</div>`;
        }

        return `
          <div class="c-item">
            <div class="c-top">
              <span class="platform-badge" style="background:${color}22;color:${color}">${c.platform}</span>
              ${channelHtml}
              ${dlHtml}
            </div>
            <div class="c-content">${c.content}</div>
            ${hoursHtml}${daysHtml}${reporterHtml}
          </div>`;
      }).join('')
    : '<div class="c-empty">현재 모집 중인 캠페인이 없어요</div>';

  const founderHtml = place.founderNickname
    ? `<div class="info-founder">🏅 최초 제보 <a class="founder-link" href="${place.founderUrl}" target="_blank">${place.founderNickname}</a></div>`
    : '';

  return `
    <div class="info-window">
      <div class="info-head">
        <span class="info-icon">${icon}</span>
        <div style="flex:1;min-width:0;">
          <div class="info-name">${place.name}</div>
          <div class="info-addr">${place.address}</div>
        </div>
        <a class="btn-naver-map" onclick="openNaverMap('${place.name.replace(/'/g,"\\'")}','${place.address.replace(/'/g,"\\'")}')">🗺️ 지도</a>
      </div>
      ${founderHtml}
      <div class="info-campaigns">${campaignsHtml}</div>
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
      <span class="detail-founder-icon"></span>
      <span class="detail-founder-label">최초제보</span>
      ${place.founderUrl
        ? `<a class="detail-founder-link" href="${place.founderUrl}" target="_blank">${place.founderNickname}</a>`
        : `<span class="detail-founder-link">${place.founderNickname}</span>`}
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
          const cls = active ? (WEEKEND.has(d) ? 'weekend' : 'weekday') : 'day-dim';
          return `<span class="${cls}">${d}</span>`;
        })
        .join(' ');
      const holidayBadge = c.excludeHoliday ? ` <span class="holiday-badge">/ 공휴일 불가</span>` : '';
      daysHtml = `
        <div class="detail-info-row">
          <span class="detail-info-icon"></span>
          <span class="detail-info-label">요일</span>
          <span class="detail-info-value">${daysFormatted}${holidayBadge}</span>
        </div>`;
    }

    const hoursHtml = c.operatingHours ? `
      <div class="detail-info-row">
        <span class="detail-info-icon"></span>
        <span class="detail-info-label">시간</span>
        <span class="detail-info-value">${c.operatingHours}</span>
      </div>` : '';

    const reporterHtml = c.reporterNickname ? `
      <div class="detail-info-row">
        <span class="detail-info-icon"></span>
        <span class="detail-info-label">제보</span>
        <span class="detail-info-value" style="color:#000">${c.reporterNickname}</span>
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
    <div class="detail-body">
      <div class="detail-place">
        <div class="detail-name-row">
          <span class="detail-name">${place.name}</span>
          <div class="detail-channels">${channelIconsHtml}</div>
        </div>
        <div class="detail-address">${place.address}</div>
      </div>
      <div class="detail-meta-section">
        ${founderHtml}
        <div class="detail-divider"></div>
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
        <div class="empty-icon">🗺️</div>
        <p>모집 중인 협찬이 없어요.<br>첫 번째로 제보해보세요!</p>
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
  btn.textContent = '⏳';
  navigator.geolocation.getCurrentPosition(
    pos => {
      map.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
      map.setZoom(15);
      btn.textContent = '📍';
      renderSidebar();
    },
    () => { showToast('위치 권한을 허용해주세요'); btn.textContent = '📍'; }
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
  } else {
    // PC: 인포윈도우 열기 — 지도 이동/줌 완료 후 좌표 기준으로 열기
    if (openInfoWindow) { openInfoWindow.close(); openInfoWindow = null; }
    setTimeout(() => {
      const entry = markerMap[placeId];
      if (!entry) return;
      const pos = new naver.maps.LatLng(place.lat, place.lng);
      entry.infoWindow.open(map, pos);
      openInfoWindow = entry.infoWindow;
    }, 200);
  }
}

function renderAll() {
  renderMarkers();
  renderSidebar();
}

// ===== 지역 검색 =====
function searchRegion() {
  const query = document.getElementById('regionSearch').value.trim();
  if (!query) return;

  function trySearch(q, fallback) {
    naver.maps.Service.geocode({ query: q }, function(status, response) {
      const items = response?.v2?.addresses;
      if (status === naver.maps.Service.Status.OK && items?.length) {
        map.setCenter(new naver.maps.LatLng(parseFloat(items[0].y), parseFloat(items[0].x)));
        map.setZoom(15);
      } else if (fallback) {
        trySearch(fallback, null);
      } else {
        showToast('검색 결과가 없어요. 주소로 검색해보세요 (예: 강남구, 성수동)');
      }
    });
  }

  const alreadyPrefixed = /^서울|^경기|^인천|^부산|^대구|^광주|^대전/.test(query);
  trySearch(query, alreadyPrefixed ? null : '서울 ' + query);
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
  sidebar.classList.toggle('expanded');
  if (!willExpand) sidebar.classList.remove('expanded-full'); // 닫을 때 full도 제거
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

// ===== 주소 검색 =====
function searchAddress() {
  const query = document.getElementById('inputAddress').value.trim();
  if (!query) { showToast('주소를 입력해주세요'); return; }

  const resultDiv = document.getElementById('searchResult');
  resultDiv.innerHTML = '<div class="search-hint">검색 중...</div>';

  naver.maps.Service.geocode({ query }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK || !response.v2.addresses?.length) {
      resultDiv.innerHTML = '<div class="search-hint error">검색 결과가 없어요</div>';
      return;
    }
    resultDiv.innerHTML = response.v2.addresses.slice(0, 5).map(item => {
      const addr = (item.roadAddress || item.jibunAddress).replace(/'/g, "\\'");
      return `
        <div class="search-item" onclick="selectAddress('${addr}', ${item.y}, ${item.x})">
          <div class="item-name">${item.roadAddress || item.jibunAddress}</div>
          <div class="item-sub">${item.jibunAddress || ''}</div>
        </div>`;
    }).join('');
  });
}

function selectAddress(address, lat, lng) {
  modalSelectedAddress = address;
  modalSelectedLat = parseFloat(lat);
  modalSelectedLng = parseFloat(lng);
  document.getElementById('inputAddress').value = address;

  // 가까운 좌표에 이미 등록된 장소 확인 (50m 이내)
  const parsedLat = parseFloat(lat), parsedLng = parseFloat(lng);
  const sameAddr = places.find(p => {
    const dLat = (p.lat - parsedLat) * 111000;
    const dLng = (p.lng - parsedLng) * 88000;
    return Math.sqrt(dLat * dLat + dLng * dLng) < 50;
  });
  if (sameAddr) {
    document.getElementById('searchResult').innerHTML =
      `<div class="selected-addr">${address}</div>
       <div class="addr-duplicate-warning">⚠️ 이 주소로 이미 <strong>${sameAddr.name}</strong>이 등록되어 있어요.
         <span class="addr-dup-select" onclick="selectExistingPlace(${sameAddr.id})">이 장소 선택하기 →</span>
       </div>`;
    return;
  }
  document.getElementById('searchResult').innerHTML = `<div class="selected-addr">${address}</div>`;
}

// ===== 기존 장소 검색 =====
function searchExistingPlaces(name) {
  const q = name.trim();
  if (q.length < 2) { document.getElementById('existingPlacesSection').style.display = 'none'; return; }

  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(q);
  const matches = places.filter(p => {
    const np = normalize(p.name);
    return np.includes(nq) || nq.includes(np) || np.includes(nq.slice(0, 3));
  });
  if (!matches.length) { document.getElementById('existingPlacesSection').style.display = 'none'; return; }

  document.getElementById('existingPlacesSection').style.display = 'block';
  document.getElementById('existingPlacesList').innerHTML = matches.map(p => `
    <div class="existing-item ${modalSelectedPlaceId === p.id ? 'selected' : ''}" onclick="selectExistingPlace(${p.id})">
      <div class="existing-item-info">
        <div class="existing-name">${p.name}</div>
        <div class="existing-addr">${p.address}</div>
      </div>
      ${modalSelectedPlaceId === p.id ? '<span class="existing-item-check">✓</span>' : ''}
    </div>`).join('');
}

function selectExistingPlace(placeId) {
  const place = places.find(p => p.id === placeId);
  if (!place) return;
  modalSelectedPlaceId = placeId;
  modalIsNewPlace = false;
  document.getElementById('inputName').value = place.name;
  document.getElementById('inputAddress').value = place.address;
  modalSelectedAddress = place.address;
  modalSelectedLat = place.lat;
  modalSelectedLng = place.lng;
  document.getElementById('searchResult').innerHTML = `<div class="selected-addr">${place.address}</div>`;
  searchExistingPlaces(place.name);
}

function clearExistingSelection() {
  modalSelectedPlaceId = null;
  modalIsNewPlace = true;
  ['inputName', 'inputAddress'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('searchResult').innerHTML = '';
  modalSelectedAddress = ''; modalSelectedLat = null; modalSelectedLng = null;
  document.getElementById('existingPlacesSection').style.display = 'none';
}

// ===== 모달 =====
function openAbout() {
  document.getElementById('aboutOverlay').classList.add('open');
}
function closeAbout() {
  document.getElementById('aboutOverlay').classList.remove('open');
}

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  resetModal();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function resetModal() {
  modalSelectedPlaceId = null; modalIsNewPlace = true;
  modalSelectedLat = null; modalSelectedLng = null; modalSelectedAddress = '';
  document.getElementById('step1').style.display = 'flex';
  document.getElementById('step2').style.display = 'none';
  ['inputName','inputAddress','inputContent','inputHours','inputNickname','inputUrl']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('inputCategory').value = '';
  document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('inputPlatform').value = '';
  const holiday = document.getElementById('holidayExclude');
  if (holiday) { holiday.classList.remove('active'); holiday.classList.add('active'); }
  document.getElementById('modalStickyHeader').classList.remove('show');
  document.querySelector('#modalOverlay .modal-header').style.display = 'flex';
  resetDateSelects();
  document.getElementById('searchResult').innerHTML = '';
  document.getElementById('existingPlacesSection').style.display = 'none';
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
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

function goStep2() {
  if (!document.getElementById('inputName').value.trim()) { showToast('장소명을 입력해주세요'); return; }
  if (!modalSelectedLat) { showToast('주소를 검색하고 선택해주세요'); return; }

  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'flex';
  // step2에서 modal-header 숨기기 (step2ScrollHeader가 대신 스크롤됨)
  document.querySelector('#modalOverlay .modal-header').style.display = 'none';
  updateStepDots(2);

  // step2 스크롤 시 sticky 헤더 표시
  const step2Body = document.getElementById('step2Body');
  step2Body.removeEventListener('scroll', handleStep2Scroll);
  step2Body.addEventListener('scroll', handleStep2Scroll, { passive: true });
  step2Body.scrollTop = 0;
  document.getElementById('modalStickyHeader').classList.remove('show');

  const name = document.getElementById('inputName').value.trim();
  const catField = document.getElementById('newPlaceCategoryField');

  if (!modalIsNewPlace) {
    catField.style.display = 'none';
    document.getElementById('founderSection').style.display = 'flex';
    document.getElementById('founderSectionTitle').textContent = '내 이름 남기기';
    document.getElementById('founderSectionDesc').textContent = '마감일까지 이 캠페인 제보자로 표시돼요';
    const place = places.find(p => p.id === modalSelectedPlaceId);
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
  document.querySelector('#modalOverlay .modal-header').style.display = 'flex';
  document.getElementById('modalStickyHeader').classList.remove('show');
  updateStepDots(1);
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

function handleStep2Scroll() {
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
function submitCampaign() {
  const channels = [...document.querySelectorAll('.channel-btn.active')].map(b => b.dataset.channel);
  const platform = document.getElementById('inputPlatform').value;
  const content = document.getElementById('inputContent').value.trim();
  const deadline = getSelectedDeadline();
  const link = '';

  if (!channels.length || !platform || !content || !deadline) {
    showToast('게시채널, 플랫폼, 협찬내용, 마감일은 필수예요!');
    return;
  }

  let placeId;

  if (modalIsNewPlace) {
    const category = document.getElementById('inputCategory').value;
    if (!category) { showToast('카테고리를 선택해주세요'); return; }
    const newPlace = {
      id: nextPlaceId++,
      name: document.getElementById('inputName').value.trim(),
      address: modalSelectedAddress,
      lat: modalSelectedLat, lng: modalSelectedLng,
      category,
      founderNickname: document.getElementById('inputNickname').value.trim(),
      founderUrl: document.getElementById('inputUrl').value.trim()
    };
    places.push(newPlace);
    placeId = newPlace.id;
  } else {
    placeId = modalSelectedPlaceId;
  }

  campaigns.push({
    id: nextCampaignId++, placeId, channels, platform, content, deadline, link,
    operatingDays: [...document.querySelectorAll('.day-btn.active')].map(b => b.textContent),
    excludeHoliday: document.getElementById('holidayExclude')?.classList.contains('active') ?? false,
    operatingHours: document.getElementById('inputHours').value.trim(),
    reporterNickname: document.getElementById('inputNickname').value.trim(),
    reporterUrl: document.getElementById('inputUrl').value.trim()
  });

  closeModal();
  renderAll();

  const place = places.find(p => p.id === placeId);
  map.setCenter(new naver.maps.LatLng(place.lat, place.lng));
  map.setZoom(16);
  showToast(`${place.name} 제보 완료!`);
}

// ===== 토스트 =====
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
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
  const sheet = document.getElementById('mobileSheet');
  const overlay = document.getElementById('mobileSheetOverlay');
  const content = document.getElementById('mobileSheetContent');
  content.innerHTML = createMobileDetailContent(place);
  sheet.style.transform = '';  // 혹시 남아 있던 드래그 위치 초기화
  sheet.classList.add('show');
  overlay.classList.add('show');
}

function closeMobileSheet() {
  const sheet = document.getElementById('mobileSheet');
  sheet.style.transform = '';
  sheet.classList.remove('show');
  document.getElementById('mobileSheetOverlay').classList.remove('show');
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
      // 클래스 먼저 제거 → 지도가 즉시 공간 확보
      sidebar.classList.remove('expanded');
      sidebar.classList.remove('expanded-full');
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
      const arrow = document.getElementById('sidebarArrow');
      if (arrow) arrow.textContent = '︿';
      setNaverLogoVisible(true);
      // 슬라이드 아웃 애니메이션
      sidebar.style.transition = 'transform 0.3s ease';
      sidebar.style.transform = 'translateY(100%)';
      setTimeout(() => {
        sidebar.style.transition = 'none';
        sidebar.style.transform = '';
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
    if (list.scrollTop < 5) startDrag(e.touches[0].clientY);
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) e.preventDefault(); // 스크롤 방지하고 드래그 처리
    moveDrag(e.touches[0].clientY);
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

// 검색창 외 영역 터치 시 키보드 닫기
document.addEventListener('click', (e) => {
  const searchInput = document.getElementById('regionSearchMobileTop');
  if (searchInput && document.activeElement === searchInput) {
    if (!e.target.closest('.mobile-header-search')) {
      searchInput.blur();
    }
  }
});

window.addEventListener('load', initMap);
