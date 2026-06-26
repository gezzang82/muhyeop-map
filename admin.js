// ===== 무협맵 어드민 =====
// app.js의 places/campaigns 배열을 공유하며, 변경 시 /api/places, /api/campaigns로 동기화

const ADMIN_PASSWORD = 'wonu1982'; // Firebase Auth로 교체 예정
const dataReady = loadInitialData();

// ===== 로그인 =====
async function tryLogin() {
  const pw = document.getElementById('loginPassword').value;
  if (pw === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminLoggedIn', 'true');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    await dataReady;
    initAdmin();
  } else {
    document.getElementById('loginError').textContent = '비밀번호가 올바르지 않아요.';
    document.getElementById('loginPassword').value = '';
  }
}

function logout() {
  sessionStorage.removeItem('adminLoggedIn');
  location.reload();
}

// ===== 탭 전환 =====
function showTab(tab) {
  document.querySelectorAll('.admin-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + tab).style.display = 'block';
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'register') populatePlaceSelect();
  if (tab === 'view') { renderPlaceList(); renderCampaignList(); }
  if (tab === 'banners') renderBannerList();
  if (tab === 'reports') renderReportList();
  if (tab === 'users') renderUserList();
}

// 조회(매장/캠페인) · 등록(등록/엑셀) 서브탭 전환
function showSubtab(group, key) {
  if (group === 'register') {
    const add = key === 'add';
    document.getElementById('sub-reg-add').style.display = add ? 'block' : 'none';
    document.getElementById('sub-reg-excel').style.display = add ? 'none' : 'block';
    document.getElementById('subtab-reg-add').classList.toggle('active', add);
    document.getElementById('subtab-reg-excel').classList.toggle('active', !add);
    if (add) populatePlaceSelect();
  } else if (group === 'view') {
    const isPlaces = key === 'places';
    document.getElementById('sub-view-places').style.display = isPlaces ? 'block' : 'none';
    document.getElementById('sub-view-campaigns').style.display = isPlaces ? 'none' : 'block';
    document.getElementById('subtab-view-places').classList.toggle('active', isPlaces);
    document.getElementById('subtab-view-campaigns').classList.toggle('active', !isPlaces);
    if (isPlaces) renderPlaceList(); else renderCampaignList();
  }
}

// ===== 커스텀 셀렉트 (네이티브 select를 숨기고 동기화되는 커스텀 드롭다운으로 감쌈) =====
function enhanceSelects(root) {
  (root || document).querySelectorAll('select:not([data-cselect])').forEach(sel => {
    if (sel.classList.contains('excel-cell-select')) return; // 엑셀 미리보기 동적 셀은 제외
    sel.setAttribute('data-cselect', '1');
    const wrap = document.createElement('div');
    wrap.className = 'cselect';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    const trigger = document.createElement('div');
    trigger.className = 'cselect-trigger';
    trigger.innerHTML = '<span class="cselect-label"></span><span class="cselect-chev"></span>';
    const menu = document.createElement('div');
    menu.className = 'cselect-menu';
    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    const label = trigger.querySelector('.cselect-label');
    const sync = () => {
      const opt = sel.options[sel.selectedIndex];
      label.textContent = opt ? opt.textContent : '';
      trigger.classList.toggle('placeholder', !sel.value);
    };
    const build = () => {
      menu.innerHTML = '';
      [...sel.options].forEach((opt, i) => {
        const item = document.createElement('div');
        item.className = 'cselect-item' + (i === sel.selectedIndex ? ' selected' : '');
        item.textContent = opt.textContent;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          sel.value = opt.value;
          sync();
          wrap.classList.remove('open');
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        menu.appendChild(item);
      });
    };
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !wrap.classList.contains('open');
      document.querySelectorAll('.cselect.open').forEach(o => o.classList.remove('open'));
      if (willOpen) { build(); wrap.classList.add('open'); }
    });
    sel._cselectSync = sync;
    sync();
  });
}
function refreshAdminSelects() {
  document.querySelectorAll('select[data-cselect]').forEach(s => s._cselectSync && s._cselectSync());
}
document.addEventListener('click', () => {
  document.querySelectorAll('.cselect.open').forEach(o => o.classList.remove('open'));
});

// ===== 초기화 =====
function initAdmin() {
  renderDashboard();
  populatePlaceSelect();
  enhanceSelects();
}

// ===== 대시보드 =====
function renderDashboard() {
  const today = getKSTTodayUTC();
  const active = campaigns.filter(c => deadlineToUTC(c.deadline) >= today);

  document.getElementById('statPlaces').textContent = places.length;
  document.getElementById('statCampaigns').textContent = campaigns.length;
  document.getElementById('statActive').textContent = active.length;

  const userCampaigns = campaigns.filter(c => c.source === 'user');
  const statUserEl = document.getElementById('statUserReported');
  if (statUserEl) statUserEl.textContent = userCampaigns.length;

  const todayParts = getKSTDateParts();
  const isCreatedToday = (createdAt) => {
    if (!createdAt) return false;
    const d = new Date(createdAt.replace(' ', 'T') + 'Z');
    const p = getKSTDateParts(d);
    return p.y === todayParts.y && p.m === todayParts.m && p.d === todayParts.d;
  };
  const statUserTodayEl = document.getElementById('statUserReportedToday');
  if (statUserTodayEl) statUserTodayEl.textContent = userCampaigns.filter(c => isCreatedToday(c.createdAt)).length;

  const statMembersEl = document.getElementById('statMembers');
  if (statMembersEl) {
    fetch('/api/users').then(r => r.json()).then(users => { statMembersEl.textContent = users.length; }).catch(() => {});
  }

  // 플랫폼별
  const platformCount = {};
  active.forEach(c => { platformCount[c.platform] = (platformCount[c.platform] || 0) + 1; });
  const platformColors = { '레뷰':'#1D9E75','리뷰노트':'#185FA5','미블':'#854F0B','강남맛집':'#993556','디너의여왕':'#E05C00','서울오빠':'#E8173A','리뷰플레이스':'#5B3EC8','포블로그':'#0066CC','링블':'#00A86B','체험뷰':'#FF6B00','기타':'#666' };
  document.getElementById('platformStats').innerHTML = Object.entries(platformCount)
    .sort((a,b) => b[1]-a[1])
    .map(([p,n]) => `
      <div class="stat-row">
        <span class="stat-badge" style="background:${platformColors[p]||'#666'}22;color:${platformColors[p]||'#666'}">${p}</span>
        <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.round(n/active.length*100)}%;background:${platformColors[p]||'#666'}"></div></div>
        <span class="stat-num">${n}개</span>
      </div>`).join('') || '<div class="empty-msg">모집 중인 캠페인 없음</div>';

  // 채널별
  const channelCount = {};
  active.forEach(c => (c.channels||[]).forEach(ch => { channelCount[ch] = (channelCount[ch]||0)+1; }));
  const chIcons = { '블로그':'icon-blog','클립':'icon-clip','인스타그램':'icon-instagram','릴스':'icon-reels','유튜브':'icon-youtube' };
  document.getElementById('channelStats').innerHTML = Object.entries(channelCount)
    .sort((a,b) => b[1]-a[1])
    .map(([ch,n]) => `
      <div class="stat-row">
        <span class="stat-ch">${chIcons[ch] ? `<svg class="icon"><use href="#${chIcons[ch]}"></use></svg>` : ''} ${ch}</span>
        <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.round(n/active.length*100)}%;background:#1a1a2e"></div></div>
        <span class="stat-num">${n}개</span>
      </div>`).join('') || '<div class="empty-msg">데이터 없음</div>';
}

// ===== 조회 공통 상태/유틸 =====
const campView = { page: 1, size: 100, total: 0, rows: [], selected: new Set() };
const placeView = { page: 1, size: 100, total: 0, rows: [], selected: new Set() };
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const _fv = id => (document.getElementById(id)?.value || '').trim();

// ===== 조회: 캠페인 (서버 사이드) =====
async function loadCampView(page) {
  if (page) campView.page = page;
  campView.size = parseInt(document.getElementById('cvSize').value, 10) || 100;
  const params = new URLSearchParams({ admin: '1', page: campView.page, size: campView.size });
  if (_fv('cvQ')) params.set('q', _fv('cvQ'));
  const platform = document.getElementById('cvPlatform').value; if (platform !== 'all') params.set('platform', platform);
  const channel = document.getElementById('cvChannel').value; if (channel !== 'all') params.set('channel', channel);
  if (_fv('cvReporter')) params.set('reporter', _fv('cvReporter'));
  const source = document.querySelector('input[name="cvSource"]:checked')?.value || 'all'; if (source !== 'all') params.set('source', source);
  const status = document.querySelector('input[name="cvStatus"]:checked')?.value || 'all'; if (status !== 'all') params.set('status', status);
  try {
    const data = await fetch('/api/campaigns?' + params).then(r => r.json());
    campView.total = data.total || 0; campView.rows = data.rows || [];
  } catch (e) { campView.total = 0; campView.rows = []; }
  campView.selected.clear();
  renderCampRows();
}
function renderCampRows() {
  const today = getKSTTodayUTC();
  document.getElementById('campaignTableBody').innerHTML = campView.rows.map(c => {
    const isActive = deadlineToUTC(c.deadline) >= today;
    return `<tr>
      <td class="td-check"><input type="checkbox" class="cv-check" data-id="${c.id}" onchange="onRowCheck('camp')"></td>
      <td class="td-id">${c.id}</td>
      <td><strong>${escHtml(c.placeName) || '-'}</strong></td>
      <td><span class="badge-platform">${escHtml(c.platform)}</span></td>
      <td>${(c.channels || []).join(', ')}</td>
      <td class="td-content">${escHtml(c.content)}</td>
      <td class="td-days">${(c.operatingDays || []).join(' ')}${c.excludeHoliday ? ' / 공휴일 불가' : ''}</td>
      <td>${c.deadline || '-'}</td>
      <td>${escHtml(c.reporterNickname) || '-'}</td>
      <td>${escHtml(c.reporterEmail) || '-'}</td>
      <td>${c.source === 'user' ? '<span class="badge-status active">유저</span>' : c.source === 'admin' ? '<span class="badge-status expired">어드민</span>' : '-'}</td>
      <td><span class="badge-status ${isActive ? 'active' : 'expired'}">${isActive ? '모집중' : '마감'}</span></td>
      <td>
        <button class="btn-edit-sm" onclick="editCampaign(${c.id})">수정</button>
        <button class="btn-del-sm" onclick="confirmDelete('campaign', ${c.id})">삭제</button>
      </td></tr>`;
  }).join('') || `<tr><td colspan="13" class="empty-msg">조건에 맞는 캠페인 없음</td></tr>`;
  document.getElementById('cvTotal').textContent = campView.total;
  document.getElementById('cvShown').textContent = campView.rows.length;
  document.getElementById('cvSelected').textContent = campView.selected.size;
  document.getElementById('cvCheckAll').checked = false;
  renderPager('camp');
}
function renderCampaignList() { loadCampView(); }

// ===== 조회: 매장 (서버 사이드) =====
async function loadPlaceView(page) {
  if (page) placeView.page = page;
  placeView.size = parseInt(document.getElementById('pvSize').value, 10) || 100;
  const params = new URLSearchParams({ admin: '1', page: placeView.page, size: placeView.size });
  if (_fv('pvQ')) params.set('q', _fv('pvQ'));
  const cat = document.getElementById('pvCategory').value; if (cat !== 'all') params.set('category', cat);
  const st = document.getElementById('pvStatus').value; if (st !== 'all') params.set('status', st);
  if (_fv('pvReporter')) params.set('reporter', _fv('pvReporter'));
  try {
    const data = await fetch('/api/places?' + params).then(r => r.json());
    placeView.total = data.total || 0; placeView.rows = data.rows || [];
  } catch (e) { placeView.total = 0; placeView.rows = []; }
  placeView.selected.clear();
  renderPlaceRows();
}
function renderPlaceRows() {
  document.getElementById('placeTableBody').innerHTML = placeView.rows.map(p => `<tr>
    <td class="td-check"><input type="checkbox" class="pv-check" data-id="${p.id}" onchange="onRowCheck('place')"></td>
    <td class="td-id">${p.id}</td>
    <td><strong>${escHtml(p.name)}</strong></td>
    <td>${escHtml(p.category)}</td>
    <td class="td-addr">${escHtml(p.address)}</td>
    <td><span class="badge-count ${p.activeCount > 0 ? 'active' : ''}">${p.activeCount}개</span></td>
    <td>${p.hidden ? '<span class="badge-count">숨김</span>' : '노출'}</td>
    <td>${escHtml(p.founderNickname) || '-'}</td>
    <td>${escHtml(p.founderEmail) || '-'}</td>
    <td>
      <button class="btn-edit-sm" onclick="openEditPlaceModal(${p.id})">수정</button>
      <button class="btn-edit-sm" onclick="togglePlaceHidden(${p.id})">${p.hidden ? '숨김 해제' : '숨김'}</button>
      <button class="btn-del-sm" onclick="confirmDelete('place', ${p.id})">삭제</button>
    </td></tr>`).join('') || `<tr><td colspan="10" class="empty-msg">조건에 맞는 매장 없음</td></tr>`;
  document.getElementById('pvTotal').textContent = placeView.total;
  document.getElementById('pvShown').textContent = placeView.rows.length;
  document.getElementById('pvSelected').textContent = placeView.selected.size;
  document.getElementById('pvCheckAll').checked = false;
  renderPager('place');
}
function renderPlaceList() { loadPlaceView(); }

// ===== 조회 공통: 페이지네이션 / 선택 / 엑셀 =====
function renderPager(type) {
  const st = type === 'place' ? placeView : campView;
  const el = document.getElementById(type === 'place' ? 'pvPager' : 'cvPager');
  const fn = type === 'place' ? 'loadPlaceView' : 'loadCampView';
  const totalPages = Math.max(1, Math.ceil(st.total / st.size));
  const cur = st.page;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const btn = (label, page, opts = {}) => `<button ${opts.disabled ? 'disabled' : ''} class="${opts.active ? 'active' : ''}" ${opts.disabled ? '' : `onclick="${fn}(${page})"`}>${label}</button>`;
  let html = btn('«', 1, { disabled: cur === 1 }) + btn('‹', cur - 1, { disabled: cur === 1 });
  let end = Math.min(totalPages, Math.max(1, cur - 2) + 4);
  let start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) html += btn(i, i, { active: i === cur });
  html += btn('›', cur + 1, { disabled: cur === totalPages }) + btn('»', totalPages, { disabled: cur === totalPages });
  el.innerHTML = html;
}
function onRowCheck(type) {
  const st = type === 'place' ? placeView : campView;
  const cls = type === 'place' ? 'pv-check' : 'cv-check';
  st.selected.clear();
  document.querySelectorAll('.' + cls + ':checked').forEach(cb => st.selected.add(Number(cb.dataset.id)));
  document.getElementById(type === 'place' ? 'pvSelected' : 'cvSelected').textContent = st.selected.size;
  const all = document.querySelectorAll('.' + cls);
  document.getElementById(type === 'place' ? 'pvCheckAll' : 'cvCheckAll').checked = all.length > 0 && st.selected.size === all.length;
}
function toggleSelectAll(type, checked) {
  const cls = type === 'place' ? 'pv-check' : 'cv-check';
  document.querySelectorAll('.' + cls).forEach(cb => { cb.checked = checked; });
  onRowCheck(type);
}
function downloadViewExcel(type) {
  const st = type === 'place' ? placeView : campView;
  if (!st.rows.length) { adminToast('내보낼 데이터가 없어요.'); return; }
  let aoa;
  if (type === 'place') {
    aoa = [['ID', '매장명', '카테고리', '주소', '활성캠페인', '상태', '최초제보자', '이메일']];
    st.rows.forEach(p => aoa.push([p.id, p.name, p.category, p.address, p.activeCount, p.hidden ? '숨김' : '노출', p.founderNickname || '', p.founderEmail || '']));
  } else {
    const today = getKSTTodayUTC();
    aoa = [['ID', '매장명', '플랫폼', '채널', '협찬내용', '요일', '마감일', '제보자', '이메일', '출처', '상태']];
    st.rows.forEach(c => aoa.push([c.id, c.placeName, c.platform, (c.channels || []).join(','), c.content, (c.operatingDays || []).join(' '), c.deadline || '', c.reporterNickname || '', c.reporterEmail || '', c.source, deadlineToUTC(c.deadline) >= today ? '모집중' : '마감']));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type === 'place' ? '매장' : '캠페인');
  XLSX.writeFile(wb, `무협맵_${type === 'place' ? '매장' : '캠페인'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

let editPlaceTargetId = null;
function openEditPlaceModal(id) {
  const p = places.find(p => p.id === id);
  if (!p) return;
  editPlaceTargetId = id;
  document.getElementById('editPlaceName').value = p.name;
  document.getElementById('editPlaceCategory').value = p.category;
  document.getElementById('editPlaceAddress').value = p.address;
  document.getElementById('editPlaceLat').value = p.lat;
  document.getElementById('editPlaceLng').value = p.lng;
  document.getElementById('editPlaceModal').style.display = 'flex';
  refreshAdminSelects();
}

function closeEditPlaceModal() {
  document.getElementById('editPlaceModal').style.display = 'none';
  editPlaceTargetId = null;
}

function searchEditPlaceAddress() {
  const addr = document.getElementById('editPlaceAddress').value.trim();
  if (!addr) { adminToast('주소를 입력해주세요'); return; }
  if (!isNaverReady()) { adminToast('지도 API 연결 실패로 좌표 검색을 사용할 수 없어요'); showMapApiBanner(); return; }
  naver.maps.Service.geocode({ query: addr }, (status, res) => {
    if (status === naver.maps.Service.Status.OK && res?.v2?.addresses?.length) {
      const r = res.v2.addresses[0];
      document.getElementById('editPlaceLat').value = parseFloat(r.y).toFixed(6);
      document.getElementById('editPlaceLng').value = parseFloat(r.x).toFixed(6);
      adminToast('좌표 검색 완료');
    } else {
      adminToast('주소를 찾을 수 없어요. 직접 입력해주세요.');
    }
  });
}

async function confirmEditPlace() {
  const id = editPlaceTargetId;
  if (!id) return;
  const name = document.getElementById('editPlaceName').value.trim();
  const category = document.getElementById('editPlaceCategory').value;
  const address = document.getElementById('editPlaceAddress').value.trim();
  const lat = parseFloat(document.getElementById('editPlaceLat').value);
  const lng = parseFloat(document.getElementById('editPlaceLng').value);
  if (!name || !category || !address) { adminToast('매장명, 카테고리, 주소는 필수예요!'); return; }

  const p = places.find(p => p.id === id);
  const addressChanged = address !== p.address;
  if (addressChanged && (isNaN(lat) || isNaN(lng))) {
    adminToast('주소를 변경했으면 좌표 검색을 다시 눌러주세요!'); return;
  }

  await fetch(`/api/places?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, address, lat: addressChanged ? lat : undefined, lng: addressChanged ? lng : undefined })
  });

  p.name = name; p.category = category; p.address = address;
  if (addressChanged) { p.lat = lat; p.lng = lng; }

  adminToast('매장 수정 완료');
  closeEditPlaceModal();
  renderPlaceList();
}

// ===== 이벤트 팝업 =====
function renderBannerList() {
  const today = getKSTTodayUTC();
  const tbody = document.getElementById('bannerTableBody');
  tbody.innerHTML = banners.map(b => {
    const isActive = deadlineToUTC(b.startDate) <= today && today <= deadlineToUTC(b.endDate);
    return `<tr>
      <td class="td-id">${b.id}</td>
      <td><img src="${b.imageUrl}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:6px;"></td>
      <td>${b.linkUrl || '-'}</td>
      <td>${b.startDate}</td>
      <td>${b.endDate}</td>
      <td><span class="badge-status ${isActive?'active':'expired'}">${isActive?'노출 중':'기간 외'}</span></td>
      <td>
        <button class="btn-del-sm" onclick="confirmDelete('banner', ${b.id})">삭제</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-msg">등록된 팝업 없음</td></tr>`;
}

async function submitBanner() {
  const imageUrl = document.getElementById('bannerImageUrl').value.trim();
  const linkUrl = document.getElementById('bannerLinkUrl').value.trim();
  const startDate = document.getElementById('bannerStartDate').value;
  const endDate = document.getElementById('bannerEndDate').value;

  if (!imageUrl || !startDate || !endDate) {
    adminToast('이미지 URL, 시작일, 종료일은 필수예요!'); return;
  }

  const res = await fetch('/api/banners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, linkUrl, startDate, endDate })
  });
  const banner = await res.json();
  banners.unshift(banner);

  adminToast('이벤트 팝업 등록 완료');
  document.getElementById('bannerImageUrl').value = '';
  document.getElementById('bannerLinkUrl').value = '';
  document.getElementById('bannerStartDate').value = '';
  document.getElementById('bannerEndDate').value = '';
  renderBannerList();
}

// ===== 회원 목록 =====
const PROVIDER_LABELS = { kakao: '카카오', naver: '네이버' };
async function renderUserList() {
  const tbody = document.getElementById('userTableBody');
  const users = await (await fetch('/api/users')).json();
  tbody.innerHTML = users.map(u => `<tr>
      <td class="td-id">${u.id}</td>
      <td>${PROVIDER_LABELS[u.provider] || u.provider}</td>
      <td>${u.nickname || '-'}</td>
      <td>${u.email || '-'}</td>
      <td>${u.urlPlatform && u.urlId ? `${u.urlPlatform}: ${u.urlId}` : '-'}</td>
      <td>${u.createdAt}</td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty-msg">가입한 회원 없음</td></tr>`;
}

// ===== 신고 목록 =====
let reports = [];
async function renderReportList() {
  const tbody = document.getElementById('reportTableBody');
  reports = await (await fetch('/api/reports')).json();
  tbody.innerHTML = reports.map(r => `<tr>
      <td class="td-id">${r.id}</td>
      <td>${r.placeName || '-'}</td>
      <td>${(r.content || '').slice(0, 20)}</td>
      <td>${r.reason}</td>
      <td>${r.detail || '-'}</td>
      <td>${r.reporterNickname || '비회원'}</td>
      <td>${r.createdAt}</td>
      <td>${reportActionButtons(r)}</td>
    </tr>`).join('') || `<tr><td colspan="8" class="empty-msg">신고 내역 없음</td></tr>`;
}

function reportActionButtons(r) {
  if (r.reason === '캠페인 정보 변경') {
    return `
      <button class="btn-edit-sm" onclick="reportEditCampaign(${r.id}, ${r.campaignId})">캠페인 수정</button>
      <button class="btn-del-sm" onclick="reportDeleteCampaign(${r.id}, ${r.campaignId})">캠페인 삭제</button>
      <button class="btn-del-sm" onclick="dismissReport(${r.id})">무시</button>`;
  }
  if (r.reason === '협찬 종료') {
    return `
      <button class="btn-edit-sm" onclick="reportHidePlace(${r.id}, ${r.placeId})">매장 숨김</button>
      <button class="btn-del-sm" onclick="reportDeletePlace(${r.id}, ${r.placeId})">매장 영구삭제</button>
      <button class="btn-del-sm" onclick="dismissReport(${r.id})">무시</button>`;
  }
  if (r.reason === '허위 정보') {
    return `
      <button class="btn-edit-sm" onclick="reportEditCampaign(${r.id}, ${r.campaignId})">캠페인 수정</button>
      <button class="btn-del-sm" onclick="reportDeleteCampaign(${r.id}, ${r.campaignId})">캠페인 삭제</button>
      <button class="btn-edit-sm" onclick="reportHidePlace(${r.id}, ${r.placeId})">매장 숨김</button>
      <button class="btn-del-sm" onclick="dismissReport(${r.id})">무시</button>`;
  }
  return `<button class="btn-del-sm" onclick="dismissReport(${r.id})">무시</button>`;
}

async function dismissReport(id) {
  await fetch(`/api/reports?id=${id}`, { method: 'DELETE' });
  const idx = reports.findIndex(r => r.id === id);
  if (idx > -1) reports.splice(idx, 1);
  renderReportList();
}

function reportEditCampaign(reportId, campaignId) {
  editCampaign(campaignId);
  dismissReport(reportId);
}

async function reportDeleteCampaign(reportId, campaignId) {
  if (!confirm('이 캠페인을 삭제할까요?')) return;
  await fetch(`/api/campaigns?id=${campaignId}`, { method: 'DELETE' });
  const idx = campaigns.findIndex(c => c.id === campaignId);
  if (idx > -1) campaigns.splice(idx, 1);
  adminToast('캠페인 삭제 완료');
  dismissReport(reportId);
}

async function reportHidePlace(reportId, placeId) {
  if (!confirm('이 매장을 지도에서 숨길까요? (캠페인은 유지되고, 매장 목록에서 언제든 숨김 해제할 수 있어요)')) return;
  await fetch(`/api/places?id=${placeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: true })
  });
  const p = places.find(p => p.id === placeId);
  if (p) p.hidden = true;
  adminToast('매장을 숨김 처리했어요.');
  dismissReport(reportId);
}

async function reportDeletePlace(reportId, placeId) {
  if (!confirm('이 매장와 모든 캠페인을 영구 삭제할까요?')) return;
  await fetch(`/api/places?id=${placeId}`, { method: 'DELETE' });
  const idx = places.findIndex(p => p.id === placeId);
  if (idx > -1) places.splice(idx, 1);
  campaigns.splice(0, campaigns.length, ...campaigns.filter(c => c.placeId !== placeId));
  adminToast('매장 및 관련 캠페인 삭제 완료');
  dismissReport(reportId);
}

// ===== 캠페인 등록 =====
function populatePlaceSelect() {
  const sel = document.getElementById('addPlaceSelect');
  sel.innerHTML = '<option value="">-- 기존 매장 선택 --</option>' +
    places.map(p => `<option value="${p.id}">${p.name} (${p.category})</option>`).join('');
  refreshAdminSelects();
}

function findDuplicatePlace(name) {
  const norm = String(name || '').replace(/\s/g, '');
  if (!norm) return null;
  return places.find(p => p.name.replace(/\s/g, '') === norm) || null;
}

function checkDuplicatePlaceName() {
  const name = document.getElementById('addName').value;
  const warnEl = document.getElementById('addNameDupWarn');
  const dup = findDuplicatePlace(name);
  if (dup) {
    warnEl.innerHTML = `이미 등록된 매장예요: "${dup.name}"<button type="button" onclick="useDuplicatePlace(${dup.id})">이 매장 사용</button>`;
    warnEl.style.display = '';
  } else {
    warnEl.style.display = 'none';
  }
}

function useDuplicatePlace(id) {
  document.getElementById('addPlaceSelect').value = id;
  onPlaceSelect();
  document.getElementById('addNameDupWarn').style.display = 'none';
}

function onPlaceSelect() {
  const val = document.getElementById('addPlaceSelect').value;
  document.getElementById('newPlaceFields').style.opacity = val ? '0.4' : '1';
  document.getElementById('newPlaceFields').style.pointerEvents = val ? 'none' : '';
}

function searchAdminAddress() {
  const addr = document.getElementById('addAddress').value.trim();
  if (!addr) { adminToast('주소를 입력해주세요'); return; }
  if (!isNaverReady()) { adminToast('지도 API 연결 실패로 좌표 검색을 사용할 수 없어요'); showMapApiBanner(); return; }
  naver.maps.Service.geocode({ query: addr }, (status, res) => {
    if (status === naver.maps.Service.Status.OK && res?.v2?.addresses?.length) {
      const r = res.v2.addresses[0];
      document.getElementById('addLat').value = parseFloat(r.y).toFixed(6);
      document.getElementById('addLng').value = parseFloat(r.x).toFixed(6);
      adminToast('좌표 검색 완료');
    } else {
      adminToast('주소를 찾을 수 없어요. 직접 입력해주세요.');
    }
  });
}

async function submitAdminCampaign() {
  const selectedPlaceId = document.getElementById('addPlaceSelect').value;
  const platform = document.getElementById('addPlatform').value;
  const channels = ['블로그','클립','인스타그램','릴스','유튜브'].filter(ch => document.getElementById(`ach_${ch}`)?.checked);
  const content = document.getElementById('addContent').value.trim();
  const link = document.getElementById('addLink').value.trim();
  const deadline = document.getElementById('addDeadline').value;
  const hours = document.getElementById('addHours').value.trim();
  const days = [...document.querySelectorAll('.day-item.on')].map(el => el.textContent.trim());

  if (!platform || !channels.length || !content) {
    adminToast('플랫폼, 채널, 협찬내용은 필수예요!'); return;
  }

  let placeId;

  if (selectedPlaceId) {
    placeId = parseInt(selectedPlaceId);
  } else {
    const name = document.getElementById('addName').value.trim();
    const address = document.getElementById('addAddress').value.trim();
    const category = document.getElementById('addCategory').value;
    const lat = parseFloat(document.getElementById('addLat').value);
    const lng = parseFloat(document.getElementById('addLng').value);
    if (!name || !address || !category || isNaN(lat) || isNaN(lng)) {
      adminToast('신규 매장는 매장명, 주소, 카테고리, 좌표가 필요해요!'); return;
    }
    const dup = findDuplicatePlace(name);
    if (dup && !confirm(`"${dup.name}"이 이미 등록되어 있어요. 그래도 새 매장로 등록할까요?`)) {
      return;
    }
    const res = await fetch('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address, lat, lng, category })
    });
    const place = await res.json();
    places.push(place);
    placeId = place.id;
    adminToast(`매장 "${name}" 등록 완료`);
  }

  const excludeHoliday = document.getElementById('addExcludeHoliday')?.checked || false;
  const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId, platform, channels, content, deadline, link,
      operatingDays: days, operatingHours: hours, excludeHoliday, source: 'admin'
    })
  });
  const campaign = await res.json();
  campaigns.push(campaign);

  adminToast('캠페인 등록 완료');
  resetAddForm();
}

function resetAddForm() {
  ['addName','addAddress','addContent','addLink','addHours','addLat','addLng'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('addPlaceSelect').value = '';
  document.getElementById('addPlatform').value = '';
  document.getElementById('addCategory').value = '';
  document.getElementById('addDeadline').value = '';
  ['블로그','클립','인스타그램','릴스','유튜브'].forEach(ch => {
    const el = document.getElementById(`ach_${ch}`); if(el) el.checked = false;
  });
  document.querySelectorAll('.day-item').forEach(d => d.classList.add('on'));
  const excludeEl = document.getElementById('addExcludeHoliday'); if(excludeEl) excludeEl.checked = false;
  document.getElementById('newPlaceFields').style.opacity = '1';
  document.getElementById('newPlaceFields').style.pointerEvents = '';
  refreshAdminSelects();
}

// ===== 삭제 =====
let confirmCallback = null;
async function togglePlaceHidden(id) {
  const p = places.find(p => p.id === id);
  if (!p) return;
  const nextHidden = !p.hidden;
  if (nextHidden && !confirm(`"${p.name}"을 지도에서 숨길까요? (캠페인은 그대로 유지되고, 언제든 다시 노출할 수 있어요)`)) return;
  await fetch(`/api/places?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: nextHidden })
  });
  p.hidden = nextHidden;
  adminToast(nextHidden ? '매장을 숨김 처리했어요.' : '매장 숨김을 해제했어요.');
  renderPlaceList();
}

function confirmDelete(type, id) {
  const name = type === 'campaign'
    ? `캠페인 ID ${id} (${campaigns.find(c=>c.id===id)?.content?.slice(0,20)}...)`
    : type === 'banner'
    ? `이벤트 팝업 ID ${id}`
    : `매장 "${places.find(p=>p.id===id)?.name}"`;
  document.getElementById('confirmMsg').textContent = `${name}을 삭제할까요?`;
  document.getElementById('confirmModal').style.display = 'flex';
  confirmCallback = async () => {
    if (type === 'campaign') {
      await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
      const idx = campaigns.findIndex(c => c.id === id);
      if (idx > -1) campaigns.splice(idx, 1);
      adminToast('캠페인 삭제 완료');
      renderCampaignList();
    } else if (type === 'banner') {
      await fetch(`/api/banners?id=${id}`, { method: 'DELETE' });
      const idx = banners.findIndex(b => b.id === id);
      if (idx > -1) banners.splice(idx, 1);
      adminToast('이벤트 팝업 삭제 완료');
      renderBannerList();
    } else {
      await fetch(`/api/places?id=${id}`, { method: 'DELETE' });
      const idx = places.findIndex(p => p.id === id);
      if (idx > -1) places.splice(idx, 1);
      campaigns.splice(0, campaigns.length, ...campaigns.filter(c => c.placeId !== id));
      adminToast('매장 및 관련 캠페인 삭제 완료');
      renderPlaceList();
    }
    closeConfirm();
  };
  document.getElementById('confirmOkBtn').onclick = confirmCallback;
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCallback = null;
}

// ===== 수정 (캠페인) =====
function editCampaign(id) {
  const c = campaigns.find(c => c.id === id);
  if (!c) return;
  showTab('register');
  showSubtab('register', 'add');
  setTimeout(() => {
    document.getElementById('addPlaceSelect').value = c.placeId;
    onPlaceSelect();
    document.getElementById('addPlatform').value = c.platform;
    (c.channels||[]).forEach(ch => {
      const el = document.getElementById(`ach_${ch}`); if(el) el.checked = true;
    });
    document.getElementById('addContent').value = c.content;
    document.getElementById('addLink').value = c.link || '';
    document.getElementById('addDeadline').value = c.deadline;
    document.getElementById('addHours').value = c.operatingHours || '';
    document.querySelectorAll('.day-item').forEach(d => {
      d.classList.toggle('on', (c.operatingDays||[]).includes(d.textContent.trim()));
    });
    const excludeEl = document.getElementById('addExcludeHoliday');
    if (excludeEl) excludeEl.checked = c.excludeHoliday || false;
    refreshAdminSelects();
    // 등록 버튼을 수정 모드로
    const btn = document.querySelector('.btn-submit');
    btn.textContent = '수정 완료';
    btn.onclick = async () => {
      c.platform = document.getElementById('addPlatform').value;
      c.channels = ['블로그','클립','인스타그램','릴스','유튜브'].filter(ch => document.getElementById(`ach_${ch}`)?.checked);
      c.content = document.getElementById('addContent').value.trim();
      c.link = document.getElementById('addLink').value.trim();
      c.deadline = document.getElementById('addDeadline').value;
      c.operatingHours = document.getElementById('addHours').value.trim();
      c.operatingDays = [...document.querySelectorAll('.day-item.on')].map(el => el.textContent.trim());
      c.excludeHoliday = document.getElementById('addExcludeHoliday')?.checked || false;
      await fetch(`/api/campaigns?id=${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: c.platform, channels: c.channels, content: c.content, deadline: c.deadline,
          link: c.link || '', operatingDays: c.operatingDays, operatingHours: c.operatingHours,
          excludeHoliday: c.excludeHoliday
        })
      });
      adminToast('캠페인 수정 완료');
      btn.textContent = '등록하기';
      btn.onclick = submitAdminCampaign;
      resetAddForm();
    };
  }, 100);
}

// ===== 엑셀 업로드 =====
let parsedRows = [];

function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processExcelFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processExcelFile(file);
}

function normalizeDeadline(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value || '').trim();
  const m = str.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return str;
}

function processExcelFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) { adminToast('데이터가 없어요'); return; }
    const headers = data[0];
    parsedRows = data.slice(1).filter(row => row.some(v => v !== ''));
    parsedRows.forEach(row => { row[6] = normalizeDeadline(row[6]); });
    renderExcelPreview(headers, parsedRows);
  };
  reader.readAsBinaryString(file);
}

const EXCEL_CATEGORY_OPTIONS = ['음식점','카페','뷰티','숙박/여가','문화','의류','안경/잡화','기타'];
const EXCEL_PLATFORM_OPTIONS = ['레뷰','리뷰노트','디너의여왕','서울오빠','리뷰플레이스','포블로그','링블','미블','강남맛집체험단','체험뷰'];
const EXCEL_CHANNEL_OPTIONS = ['블로그','클립','인스타그램','릴스','유튜브'];
const EXCEL_DAY_OPTIONS = ['월','화','수','목','금','토','일'];

function updateExcelCategory(idx, value) {
  parsedRows[idx][2] = value;
}
function updateExcelPlatform(idx, value) {
  parsedRows[idx][3] = value;
}
function toggleExcelChannel(idx, channel, checked) {
  let chans = String(parsedRows[idx][4] || '').split(',').map(s => s.trim()).filter(Boolean);
  if (checked) {
    if (!chans.includes(channel)) chans.push(channel);
  } else {
    chans = chans.filter(c => c !== channel);
  }
  parsedRows[idx][4] = chans.join(',');
}
function toggleExcelDay(idx, day, checked) {
  const current = String(parsedRows[idx][8] || '').trim();
  let days = current ? current.split(',').map(s => s.trim()).filter(Boolean) : EXCEL_DAY_OPTIONS.slice();
  if (checked) {
    if (!days.includes(day)) days.push(day);
  } else {
    days = days.filter(d => d !== day);
  }
  parsedRows[idx][8] = days.join(',');
}

function renderExcelPreview(headers, rows) {
  document.getElementById('previewSection').style.display = 'block';
  document.getElementById('previewCount').textContent = `${rows.length}행 감지`;
  document.getElementById('previewHead').innerHTML =
    '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  document.getElementById('previewBody').innerHTML = rows.slice(0, 10).map((row, idx) =>
    '<tr>' + row.map((v, colIdx) => {
      if (colIdx === 2) {
        return `<td><select class="excel-cell-select" onchange="updateExcelCategory(${idx}, this.value)">` +
          EXCEL_CATEGORY_OPTIONS.map(opt => `<option value="${opt}"${String(v).trim() === opt ? ' selected' : ''}>${opt}</option>`).join('') +
          `</select></td>`;
      }
      if (colIdx === 3) {
        return `<td><select class="excel-cell-select" onchange="updateExcelPlatform(${idx}, this.value)">` +
          EXCEL_PLATFORM_OPTIONS.map(opt => `<option value="${opt}"${String(v).trim() === opt ? ' selected' : ''}>${opt}</option>`).join('') +
          `</select></td>`;
      }
      if (colIdx === 4) {
        const selected = String(v).split(',').map(s => s.trim()).filter(Boolean);
        return `<td><div class="excel-cell-channels">` +
          EXCEL_CHANNEL_OPTIONS.map(opt =>
            `<label class="excel-channel-chip"><input type="checkbox" ${selected.includes(opt) ? 'checked' : ''} onchange="toggleExcelChannel(${idx}, '${opt}', this.checked)">${opt}</label>`
          ).join('') +
          `</div></td>`;
      }
      if (colIdx === 8) {
        const raw = String(v).trim();
        const selected = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : EXCEL_DAY_OPTIONS.slice();
        return `<td><div class="excel-cell-channels">` +
          EXCEL_DAY_OPTIONS.map(opt =>
            `<label class="excel-channel-chip"><input type="checkbox" ${selected.includes(opt) ? 'checked' : ''} onchange="toggleExcelDay(${idx}, '${opt}', this.checked)">${opt}</label>`
          ).join('') +
          `</div></td>`;
      }
      return `<td>${v}</td>`;
    }).join('') + '</tr>'
  ).join('') + (rows.length > 10 ? `<tr><td colspan="${headers.length}" style="text-align:center;color:#aaa">...외 ${rows.length-10}행 (수정은 최초 10행만 가능)</td></tr>` : '');
}

function geocodeAddress(addr) {
  if (!isNaverReady()) { showMapApiBanner(); return Promise.resolve(null); }
  return new Promise(resolve => {
    naver.maps.Service.geocode({ query: addr }, (status, res) => {
      if (status === naver.maps.Service.Status.OK && res?.v2?.addresses?.length) {
        const r = res.v2.addresses[0];
        resolve({ lat: parseFloat(r.y), lng: parseFloat(r.x) });
      } else {
        resolve(null);
      }
    });
  });
}

async function importExcelData() {
  const btn = document.getElementById('excelImportBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '가져오는 중...';

  let added = 0, skipped = 0;
  for (const row of parsedRows) {
    const [name, address, category, platform, channelRaw, content, deadline, hours, daysRaw, excludeHolidayRaw] = row;
    if (!name || !address || !platform || !content) { skipped++; continue; }

    const channels = String(channelRaw).split(',').map(s => s.trim()).filter(Boolean);
    const daysParsed = String(daysRaw || '').split(',').map(s => s.trim()).filter(Boolean);
    const operatingDays = daysParsed.length ? daysParsed : ['월','화','수','목','금','토','일'];
    const excludeHoliday = String(excludeHolidayRaw || '').trim().toUpperCase() === 'Y';

    // 기존 매장 or 신규
    let place = places.find(p => p.name.replace(/\s/g,'') === String(name).replace(/\s/g,''));
    if (!place) {
      const coords = await geocodeAddress(String(address));
      if (!coords) { skipped++; continue; }
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(name), address: String(address), lat: coords.lat, lng: coords.lng, category: String(category) || '기타' })
      });
      place = await res.json();
      places.push(place);
    }

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId: place.id, platform: String(platform), channels,
        content: String(content), deadline: deadline ? String(deadline) : '', link: '',
        operatingDays, operatingHours: String(hours) || '', excludeHoliday, source: 'admin'
      })
    });
    campaigns.push(await res.json());
    added++;
  }
  adminToast(`${added}개 등록 완료${skipped ? ` (${skipped}개 건너뜀)` : ''}`);
  btn.disabled = false;
  btn.textContent = '전체 가져오기';
  resetExcel();
  renderDashboard();
}

function resetExcel() {
  parsedRows = [];
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('excelFile').value = '';
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['매장명','주소','카테고리','플랫폼','채널','협찬내용','마감일','영업시간','가능요일','공휴일불가'],
    ['스시코우지 강남','서울 강남구 테헤란로 152','음식점','레뷰','블로그,클립','오마카세 1인 체험','2026-07-31','12:00~22:00','월,화,수,목,금','Y'],
    ['카페 노티드 청담','서울 강남구 압구정로 428','카페','미블','인스타그램','음료 2잔 체험','2026-07-15','10:00~22:00','',''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '무협맵 업로드');
  XLSX.writeFile(wb, '무협맵_업로드양식.xlsx');
}

// ===== 토스트 =====
function adminToast(msg) {
  const el = document.getElementById('adminToast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// 네이버 지도 스크립트(geocoding) 로드 여부 확인 + 실패 안내 배너
function isNaverReady() {
  return typeof naver !== 'undefined' && naver.maps && naver.maps.Service;
}
function showMapApiBanner() {
  const b = document.getElementById('mapApiBanner');
  if (b) b.hidden = false;
}

// ===== 자동 로그인 체크 =====
window.addEventListener('DOMContentLoaded', async () => {
  // 네이버 지도 스크립트가 로드되지 않았으면 상단 안내 배너 노출
  if (!isNaverReady()) showMapApiBanner();
  if (sessionStorage.getItem('adminLoggedIn') === 'true') {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    await dataReady;
    initAdmin();
  }
  // 엔터키 로그인
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin();
  });
});
