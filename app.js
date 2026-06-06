// ===== 무협맵 app.js (네이버지도 버전) =====

let campaigns = [
  {
    id: 1,
    name: "스시코우지 강남",
    address: "서울 강남구 테헤란로 152",
    lat: 37.5000,
    lng: 127.0370,
    platform: "레뷰",
    content: "오마카세 1인 체험",
    deadline: "2026-06-10",
    blog: "https://blog.naver.com/example1",
    nickname: "맛집탐험가",
    selected: false
  },
  {
    id: 2,
    name: "올리브영 강남본점",
    address: "서울 강남구 강남대로 422",
    lat: 37.5012,
    lng: 127.0247,
    platform: "리뷰노트",
    content: "신제품 스킨케어 체험",
    deadline: "2026-06-15",
    blog: "https://blog.naver.com/example2",
    nickname: "뷰티로그",
    selected: false
  },
  {
    id: 3,
    name: "카페 노티드 청담",
    address: "서울 강남구 압구정로 428",
    lat: 37.5247,
    lng: 127.0430,
    platform: "미블",
    content: "시즌 한정 음료 리뷰",
    deadline: "2026-06-20",
    blog: "https://blog.naver.com/example3",
    nickname: "카페투어러",
    selected: false
  },
  {
    id: 4,
    name: "젝시믹스 강남점",
    address: "서울 강남구 강남대로 390",
    lat: 37.4975,
    lng: 127.0280,
    platform: "강남체험단",
    content: "신상 레깅스 착용 리뷰",
    deadline: "2026-06-25",
    blog: "",
    nickname: "",
    selected: false
  }
];

let currentFilter = "전체";
let map;
let markers = [];
let polyline = null;
let nextId = 5;
let selectedLat = null;
let selectedLng = null;
let selectedAddress = "";

// ===== 지도 초기화 =====
function initMap() {
  const mapOptions = {
    center: new naver.maps.LatLng(37.5040, 127.0300),
    zoom: 14,
    mapTypeControl: false,
    scaleControl: false,
    logoControl: true,
    mapDataControl: false
  };

  map = new naver.maps.Map('map', mapOptions);
  renderAll();
}

// ===== 플랫폼 색상 =====
function getPlatformColor(platform) {
  const colors = {
    '레뷰': '#1D9E75',
    '리뷰노트': '#185FA5',
    '미블': '#854F0B',
    '강남체험단': '#993556',
    '기타': '#666666'
  };
  return colors[platform] || '#666666';
}

// ===== 마커 렌더 =====
function renderMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];

  const filtered = getFiltered();

  filtered.forEach((c, idx) => {
    const color = getPlatformColor(c.platform);
    const isSelected = c.selected;

    const markerContent = `
      <div style="
        width: ${isSelected ? '38px' : '32px'};
        height: ${isSelected ? '38px' : '32px'};
        background: ${isSelected ? '#e8c96d' : color};
        border: 3px solid ${isSelected ? '#1a1a2e' : 'white'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${isSelected ? '14px' : '12px'};
        font-weight: 800;
        color: ${isSelected ? '#1a1a2e' : 'white'};
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        font-family: 'Nanum Gothic', sans-serif;
      ">${idx + 1}</div>
    `;

    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(c.lat, c.lng),
      map: map,
      icon: {
        content: markerContent,
        anchor: new naver.maps.Point(isSelected ? 19 : 16, isSelected ? 19 : 16)
      }
    });

    const infoWindow = new naver.maps.InfoWindow({
      content: createInfoContent(c),
      borderWidth: 0,
      borderRadius: '12px',
      backgroundColor: 'white',
      pixelOffset: new naver.maps.Point(0, -10)
    });

    naver.maps.Event.addListener(marker, 'click', () => {
      markers.forEach((m, i) => {
        if (i !== idx) m._infoWindow && m._infoWindow.close();
      });
      if (infoWindow.getMap()) {
        infoWindow.close();
      } else {
        infoWindow.open(map, marker);
      }
      toggleSelect(c.id);
    });

    marker._infoWindow = infoWindow;
    markers.push(marker);
  });
}

// ===== 인포윈도우 내용 =====
function createInfoContent(c) {
  const dl = getDeadlineText(c.deadline);
  const deadlineHtml = dl
    ? `<div style="font-size:11px; color:${dl.urgent ? '#e8453c' : '#888'}; margin-bottom:5px;">${dl.text}</div>`
    : '';
  const blogHtml = c.blog
    ? `<a href="${c.blog}" target="_blank" style="font-size:11px; color:#185fa5; text-decoration:none;">📝 ${c.nickname || '블로그 보기'}</a>`
    : '';

  return `
    <div style="padding:14px 16px; font-family:'Noto Sans KR',sans-serif; min-width:200px; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.12);">
      <div style="font-weight:700; font-size:14px; color:#1a1a2e; margin-bottom:4px;">${c.name}</div>
      <div style="font-size:11px; color:#888; margin-bottom:8px;">${c.address}</div>
      <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
        <span style="background:${getPlatformColor(c.platform)}22; color:${getPlatformColor(c.platform)}; font-size:10px; padding:2px 7px; border-radius:4px; font-weight:700;">${c.platform}</span>
        <span style="font-size:12px; color:#444;">${c.content}</span>
      </div>
      ${deadlineHtml}
      ${blogHtml}
    </div>
  `;
}

// ===== 마감일 계산 =====
function getDeadlineText(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(deadline);
  const diff = Math.ceil((dl - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: '마감됨', urgent: true };
  if (diff === 0) return { text: '⏰ 오늘 마감!', urgent: true };
  if (diff <= 3) return { text: `⏰ 마감 D-${diff}`, urgent: true };
  return { text: `마감 D-${diff}`, urgent: false };
}

// ===== 사이드바 렌더 =====
function renderSidebar() {
  const list = document.getElementById('campaignList');
  const count = document.getElementById('campaignCount');
  const filtered = getFiltered();

  count.textContent = `${filtered.length}개`;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺️</div>
        <p>등록된 협찬이 없어요.<br>첫 번째로 제보해보세요!</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map((c, idx) => {
    const dl = getDeadlineText(c.deadline);
    const deadlineHtml = dl
      ? `<span class="card-deadline ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>`
      : '';
    const blogHtml = c.blog
      ? `<a class="card-blog" href="${c.blog}" target="_blank" onclick="event.stopPropagation()">📝 ${c.nickname || '블로그'}</a>`
      : '';

    return `
      <div class="campaign-card ${c.selected ? 'selected' : ''}" onclick="toggleSelect(${c.id})">
        <div class="card-top">
          <span class="platform-badge badge-${c.platform}">${c.platform}</span>
          <span class="card-name">${c.name}</span>
        </div>
        <div class="card-content">${c.content || '내용 없음'}</div>
        <div class="card-bottom">${deadlineHtml}${blogHtml}</div>
      </div>
    `;
  }).join('');

  updateRouteInfo();
}

// ===== 전체 렌더 =====
function renderAll() {
  renderMarkers();
  renderSidebar();
}

// ===== 필터 =====
function getFiltered() {
  if (currentFilter === '전체') return campaigns;
  return campaigns.filter(c => c.platform === currentFilter);
}

function filterPlatform(platform) {
  currentFilter = platform;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === platform);
  });
  renderAll();
}

// ===== 선택 토글 =====
function toggleSelect(id) {
  const c = campaigns.find(c => c.id === id);
  if (c) {
    c.selected = !c.selected;
    renderAll();
  }
}

// ===== 루트 정보 =====
function updateRouteInfo() {
  const selected = campaigns.filter(c => c.selected);
  const info = document.getElementById('routeInfo');
  if (selected.length === 0) {
    info.textContent = '캠페인을 선택하면 루트가 생성됩니다';
  } else {
    info.textContent = `${selected.length}곳 선택됨 → 루트 최적화를 눌러보세요`;
  }
}

// ===== 루트 생성 =====
function generateRoute() {
  const selected = campaigns.filter(c => c.selected);
  if (selected.length < 2) {
    showToast('2곳 이상 선택해주세요!');
    return;
  }

  clearPolyline();

  const path = selected.map(c => new naver.maps.LatLng(c.lat, c.lng));

  polyline = new naver.maps.Polyline({
    map: map,
    path: path,
    strokeColor: '#e8c96d',
    strokeWeight: 4,
    strokeOpacity: 0.9,
    strokeStyle: 'shortdash'
  });

  const bounds = new naver.maps.LatLngBounds();
  path.forEach(p => bounds.extend(p));
  map.fitBounds(bounds, { padding: 60 });

  const totalDist = calcTotalDistance(selected);
  const walkMin = Math.round(totalDist / 80);

  document.getElementById('routeInfo').innerHTML =
    `✅ ${selected.length}곳 루트 생성<br>총 약 ${totalDist}m · 도보 약 ${walkMin}분`;

  showToast(`루트 생성 완료! 총 ${selected.length}곳`);
}

// ===== 거리 계산 =====
function calcTotalDistance(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = new naver.maps.LatLng(points[i].lat, points[i].lng);
    const b = new naver.maps.LatLng(points[i + 1].lat, points[i + 1].lng);
    total += naver.maps.geography.getDistance(a, b);
  }
  return Math.round(total);
}

// ===== 루트 초기화 =====
function clearPolyline() {
  if (polyline) { polyline.setMap(null); polyline = null; }
}

function clearRoute() {
  clearPolyline();
  campaigns.forEach(c => c.selected = false);
  renderAll();
  showToast('루트가 초기화되었어요');
}

// ===== 주소 검색 (네이버 Geocoding) =====
function searchAddress() {
  const query = document.getElementById('inputAddress').value.trim();
  if (!query) { showToast('주소를 입력해주세요'); return; }

  const resultDiv = document.getElementById('searchResult');
  resultDiv.innerHTML = '<div style="padding:8px; color:#888; font-size:12px;">검색 중...</div>';

  naver.maps.Service.geocode({ query: query }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK) {
      resultDiv.innerHTML = '<div style="padding:8px; color:#e8453c; font-size:12px;">검색 결과가 없어요. 다시 시도해보세요.</div>';
      return;
    }

    const items = response.v2.addresses;
    if (!items || items.length === 0) {
      resultDiv.innerHTML = '<div style="padding:8px; color:#e8453c; font-size:12px;">검색 결과가 없어요.</div>';
      return;
    }

    resultDiv.innerHTML = items.slice(0, 5).map((item, i) => `
      <div class="search-item" onclick="selectPlace('${item.roadAddress || item.jibunAddress}', ${item.y}, ${item.x})">
        <div class="item-name">${item.roadAddress || item.jibunAddress}</div>
        <div class="item-addr">${item.jibunAddress || ''}</div>
      </div>
    `).join('');
  });
}

// ===== 장소 선택 =====
function selectPlace(address, lat, lng) {
  selectedAddress = address;
  selectedLat = parseFloat(lat);
  selectedLng = parseFloat(lng);

  document.getElementById('inputAddress').value = address;
  document.getElementById('searchResult').innerHTML = `
    <div class="selected-place">✅ ${address}</div>
  `;

  map.setCenter(new naver.maps.LatLng(selectedLat, selectedLng));
  map.setZoom(16);
}

// ===== 모달 =====
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  selectedLat = null;
  selectedLng = null;
  selectedAddress = "";
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  clearForm();
}

function clearForm() {
  ['inputName', 'inputAddress', 'inputContent', 'inputBlog', 'inputNickname', 'inputDeadline'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('inputPlatform').value = '';
  document.getElementById('searchResult').innerHTML = '';
  selectedLat = null;
  selectedLng = null;
}

// ===== 제보 제출 =====
function submitCampaign() {
  const name = document.getElementById('inputName').value.trim();
  const address = document.getElementById('inputAddress').value.trim();
  const platform = document.getElementById('inputPlatform').value;

  if (!name || !address || !platform) {
    showToast('장소명, 주소, 플랫폼은 필수예요!');
    return;
  }

  if (!selectedLat || !selectedLng) {
    showToast('주소 검색 후 장소를 선택해주세요!');
    return;
  }

  const newCampaign = {
    id: nextId++,
    name,
    address,
    lat: selectedLat,
    lng: selectedLng,
    platform,
    content: document.getElementById('inputContent').value.trim() || '내용 없음',
    deadline: document.getElementById('inputDeadline').value,
    blog: document.getElementById('inputBlog').value.trim(),
    nickname: document.getElementById('inputNickname').value.trim(),
    selected: false
  };

  campaigns.push(newCampaign);
  closeModal();
  renderAll();

  map.setCenter(new naver.maps.LatLng(selectedLat, selectedLng));
  map.setZoom(16);
  showToast(`${name} 제보 완료!`);
}

// ===== 토스트 =====
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== 시작 =====
window.addEventListener('load', initMap);
