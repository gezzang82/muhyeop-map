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
  if (tab === 'campaigns') renderCampaignList();
  if (tab === 'places') renderPlaceList();
  if (tab === 'add') populatePlaceSelect();
  if (tab === 'banners') renderBannerList();
  if (tab === 'reports') renderReportList();
}

// ===== 초기화 =====
function initAdmin() {
  renderDashboard();
  populatePlaceSelect();
}

// ===== 대시보드 =====
function renderDashboard() {
  const today = getKSTTodayUTC();
  const active = campaigns.filter(c => deadlineToUTC(c.deadline) >= today);
  const expired = campaigns.filter(c => deadlineToUTC(c.deadline) < today);

  document.getElementById('statPlaces').textContent = places.length;
  document.getElementById('statCampaigns').textContent = campaigns.length;
  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statExpired').textContent = expired.length;

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

  // 플랫폼별
  const platformCount = {};
  active.forEach(c => { platformCount[c.platform] = (platformCount[c.platform] || 0) + 1; });
  const platformColors = { '레뷰':'#1D9E75','리뷰노트':'#185FA5','미블':'#854F0B','강남맛집':'#993556','디너의여왕':'#E05C00','기타':'#666' };
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
  const chIcons = { '블로그':'📝','클립':'🎬','인스타그램':'📸' };
  document.getElementById('channelStats').innerHTML = Object.entries(channelCount)
    .sort((a,b) => b[1]-a[1])
    .map(([ch,n]) => `
      <div class="stat-row">
        <span class="stat-ch">${chIcons[ch]||''} ${ch}</span>
        <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.round(n/active.length*100)}%;background:#1a1a2e"></div></div>
        <span class="stat-num">${n}개</span>
      </div>`).join('') || '<div class="empty-msg">데이터 없음</div>';

  // 마감 임박 (D-2 이내)
  const d2 = today + 2 * 86400000;
  const urgent = active.filter(c => deadlineToUTC(c.deadline) <= d2)
    .sort((a,b) => deadlineToUTC(a.deadline)-deadlineToUTC(b.deadline));
  document.getElementById('urgentList').innerHTML = urgent.length
    ? urgent.map(c => {
        const place = places.find(p => p.id === c.placeId);
        const diff = Math.round((deadlineToUTC(c.deadline)-today)/86400000);
        return `<div class="urgent-item">
          <span class="urgent-place">${place?.name || '-'}</span>
          <span class="urgent-platform">${c.platform}</span>
          <span class="urgent-dl ${diff<=3?'red':''}">${diff === 0 ? 'D-Day' : `D-${diff}`} · ${c.deadline}</span>
        </div>`;
      }).join('')
    : '<div class="empty-msg">임박한 캠페인 없음</div>';
}

// ===== 캠페인 목록 =====
let selectedExpiredIds = new Set();

function renderCampaignList() {
  const today = getKSTTodayUTC();
  const statusFilter = document.getElementById('filterStatus').value;
  const platformFilter = document.getElementById('filterPlatform').value;

  let list = [...campaigns];
  if (statusFilter === 'active') list = list.filter(c => deadlineToUTC(c.deadline) >= today);
  if (statusFilter === 'expired') list = list.filter(c => deadlineToUTC(c.deadline) < today);
  if (platformFilter !== 'all') list = list.filter(c => c.platform === platformFilter);
  list.sort((a,b) => deadlineToUTC(b.deadline)-deadlineToUTC(a.deadline));

  const tbody = document.getElementById('campaignTableBody');
  tbody.innerHTML = list.map(c => {
    const place = places.find(p => p.id === c.placeId);
    const isActive = deadlineToUTC(c.deadline) >= today;
    return `<tr class="${isActive ? '' : 'row-expired'}">
      <td>${isActive ? '' : `<input type="checkbox" class="row-select" data-id="${c.id}" ${selectedExpiredIds.has(c.id) ? 'checked' : ''} onchange="toggleSelectExpired(${c.id}, this.checked)">`}</td>
      <td class="td-id">${c.id}</td>
      <td><strong>${place?.name || '-'}</strong></td>
      <td><span class="badge-platform">${c.platform}</span></td>
      <td>${(c.channels||[]).join(', ')}</td>
      <td class="td-content">${c.content}</td>
      <td class="td-days">${(c.operatingDays||[]).join(' ')}${c.excludeHoliday ? ' / 공휴일 불가' : ''}</td>
      <td>${c.deadline}</td>
      <td>${c.reporterNickname || '-'}</td>
      <td>${c.reporterEmail || '-'}</td>
      <td>${c.source === 'user' ? '<span class="badge-status active">유저</span>' : c.source === 'admin' ? '<span class="badge-status expired">어드민</span>' : '-'}</td>
      <td><span class="badge-status ${isActive?'active':'expired'}">${isActive?'모집 중':'마감'}</span></td>
      <td>
        ${isActive ? '' : `<button class="btn-edit-sm" onclick="openReactivateModal(false, ${c.id})">재등록</button>`}
        <button class="btn-edit-sm" onclick="editCampaign(${c.id})">수정</button>
        <button class="btn-del-sm" onclick="confirmDelete('campaign', ${c.id})">삭제</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="13" class="empty-msg">해당하는 캠페인 없음</td></tr>`;

  document.getElementById('selectAllExpiredCb').checked = false;
  updateBulkReactivateBar();
}

function toggleSelectExpired(id, checked) {
  if (checked) selectedExpiredIds.add(id);
  else selectedExpiredIds.delete(id);
  updateBulkReactivateBar();
}

function toggleSelectAllExpired(checked) {
  document.querySelectorAll('#campaignTableBody .row-select').forEach(cb => {
    cb.checked = checked;
    const id = parseInt(cb.dataset.id);
    if (checked) selectedExpiredIds.add(id);
    else selectedExpiredIds.delete(id);
  });
  updateBulkReactivateBar();
}

function updateBulkReactivateBar() {
  const bar = document.getElementById('bulkReactivateBar');
  const count = selectedExpiredIds.size;
  document.getElementById('bulkSelCount').textContent = count;
  bar.style.display = count > 0 ? 'flex' : 'none';
}

// ===== 재등록(마감일 변경) =====
let reactivateTargetIds = [];

function openReactivateModal(bulk, id) {
  reactivateTargetIds = bulk ? [...selectedExpiredIds] : [id];
  if (!reactivateTargetIds.length) return;
  const msg = bulk
    ? `선택한 ${reactivateTargetIds.length}개 캠페인의 새 마감일을 정해주세요.`
    : (() => {
        const c = campaigns.find(c => c.id === id);
        const place = places.find(p => p.id === c?.placeId);
        return `"${place?.name || '-'}" (${c?.content?.slice(0,20) || ''}) 캠페인의 새 마감일을 정해주세요.`;
      })();
  document.getElementById('reactivateMsg').textContent = msg;
  document.getElementById('reactivateDateInput').value = '';
  document.getElementById('reactivateModal').style.display = 'flex';
}

function closeReactivateModal() {
  document.getElementById('reactivateModal').style.display = 'none';
  reactivateTargetIds = [];
}

async function confirmReactivate() {
  const newDeadline = document.getElementById('reactivateDateInput').value;
  if (!newDeadline) { adminToast('새 마감일을 선택해주세요.'); return; }

  for (const id of reactivateTargetIds) {
    const c = campaigns.find(c => c.id === id);
    if (!c) continue;
    c.deadline = newDeadline;
    await fetch(`/api/campaigns?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: c.platform, channels: c.channels, content: c.content, deadline: newDeadline,
        link: c.link || '', operatingDays: c.operatingDays, operatingHours: c.operatingHours,
        excludeHoliday: c.excludeHoliday
      })
    });
    selectedExpiredIds.delete(id);
  }

  adminToast(`✅ ${reactivateTargetIds.length}개 캠페인 재등록 완료`);
  closeReactivateModal();
  renderCampaignList();
}

// ===== 장소 목록 =====
function renderPlaceList() {
  const today = getKSTTodayUTC();
  const tbody = document.getElementById('placeTableBody');
  tbody.innerHTML = places.map(p => {
    const activeCnt = campaigns.filter(c => c.placeId === p.id && deadlineToUTC(c.deadline) >= today).length;
    return `<tr>
      <td class="td-id">${p.id}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category}</td>
      <td class="td-addr">${p.address}</td>
      <td><span class="badge-count ${activeCnt>0?'active':''}">${activeCnt}개</span></td>
      <td>${p.founderNickname || '-'}</td>
      <td>${p.founderEmail || '-'}</td>
      <td>
        <button class="btn-del-sm" onclick="confirmDelete('place', ${p.id})">삭제</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty-msg">등록된 장소 없음</td></tr>`;
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

  adminToast('이벤트 팝업 등록 완료 ✅');
  document.getElementById('bannerImageUrl').value = '';
  document.getElementById('bannerLinkUrl').value = '';
  document.getElementById('bannerStartDate').value = '';
  document.getElementById('bannerEndDate').value = '';
  renderBannerList();
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
      <td>${r.createdAt}</td>
      <td>
        <button class="btn-del-sm" onclick="resolveReport(${r.id}, ${r.campaignId}, true)">숨기기</button>
        <button class="btn-del-sm" onclick="resolveReport(${r.id}, ${r.campaignId}, false)">무시</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty-msg">신고 내역 없음</td></tr>`;
}

async function resolveReport(id, campaignId, hide) {
  if (hide && !confirm('해당 캠페인을 숨김 처리할까요?')) return;
  const url = hide ? `/api/reports?id=${id}&hide=true&campaignId=${campaignId}` : `/api/reports?id=${id}`;
  await fetch(url, { method: 'DELETE' });
  const idx = reports.findIndex(r => r.id === id);
  if (idx > -1) reports.splice(idx, 1);
  if (hide) {
    const c = campaigns.find(c => c.id === campaignId);
    if (c) c.hidden = true;
  }
  adminToast(hide ? '캠페인을 숨김 처리했어요.' : '신고를 무시했어요.');
  renderReportList();
}

// ===== 캠페인 등록 =====
function populatePlaceSelect() {
  const sel = document.getElementById('addPlaceSelect');
  sel.innerHTML = '<option value="">-- 기존 장소 선택 --</option>' +
    places.map(p => `<option value="${p.id}">${p.name} (${p.category})</option>`).join('');
}

function onPlaceSelect() {
  const val = document.getElementById('addPlaceSelect').value;
  document.getElementById('newPlaceFields').style.opacity = val ? '0.4' : '1';
  document.getElementById('newPlaceFields').style.pointerEvents = val ? 'none' : '';
}

function searchAdminAddress() {
  const addr = document.getElementById('addAddress').value.trim();
  if (!addr) { adminToast('주소를 입력해주세요'); return; }
  naver.maps.Service.geocode({ query: addr }, (status, res) => {
    if (status === naver.maps.Service.Status.OK && res?.v2?.addresses?.length) {
      const r = res.v2.addresses[0];
      document.getElementById('addLat').value = parseFloat(r.y).toFixed(6);
      document.getElementById('addLng').value = parseFloat(r.x).toFixed(6);
      adminToast('좌표 검색 완료 ✅');
    } else {
      adminToast('주소를 찾을 수 없어요. 직접 입력해주세요.');
    }
  });
}

async function submitAdminCampaign() {
  const selectedPlaceId = document.getElementById('addPlaceSelect').value;
  const platform = document.getElementById('addPlatform').value;
  const channels = ['블로그','클립','인스타그램','유튜브'].filter(ch => document.getElementById(`ach_${ch}`)?.checked);
  const content = document.getElementById('addContent').value.trim();
  const deadline = document.getElementById('addDeadline').value;
  const hours = document.getElementById('addHours').value.trim();
  const days = [...document.querySelectorAll('.day-item.on')].map(el => el.textContent.trim());

  if (!platform || !channels.length || !content || !deadline) {
    adminToast('플랫폼, 채널, 협찬내용, 마감일은 필수예요!'); return;
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
      adminToast('신규 장소는 장소명, 주소, 카테고리, 좌표가 필요해요!'); return;
    }
    const res = await fetch('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, address, lat, lng, category })
    });
    const place = await res.json();
    places.push(place);
    placeId = place.id;
    adminToast(`장소 "${name}" 등록 완료`);
  }

  const excludeHoliday = document.getElementById('addExcludeHoliday')?.checked || false;
  const res = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId, platform, channels, content, deadline, link: '',
      operatingDays: days, operatingHours: hours, excludeHoliday, source: 'admin'
    })
  });
  const campaign = await res.json();
  campaigns.push(campaign);

  adminToast('캠페인 등록 완료 ✅');
  resetAddForm();
}

function resetAddForm() {
  ['addName','addAddress','addContent','addHours','addLat','addLng'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('addPlaceSelect').value = '';
  document.getElementById('addPlatform').value = '';
  document.getElementById('addCategory').value = '';
  document.getElementById('addDeadline').value = '';
  ['블로그','클립','인스타그램','유튜브'].forEach(ch => {
    const el = document.getElementById(`ach_${ch}`); if(el) el.checked = false;
  });
  document.querySelectorAll('.day-item').forEach(d => d.classList.remove('on'));
  const excludeEl = document.getElementById('addExcludeHoliday'); if(excludeEl) excludeEl.checked = false;
  document.getElementById('newPlaceFields').style.opacity = '1';
  document.getElementById('newPlaceFields').style.pointerEvents = '';
}

// ===== 삭제 =====
let confirmCallback = null;
function confirmDelete(type, id) {
  const name = type === 'campaign'
    ? `캠페인 ID ${id} (${campaigns.find(c=>c.id===id)?.content?.slice(0,20)}...)`
    : type === 'banner'
    ? `이벤트 팝업 ID ${id}`
    : `장소 "${places.find(p=>p.id===id)?.name}"`;
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
      adminToast('장소 및 관련 캠페인 삭제 완료');
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
  showTab('add');
  setTimeout(() => {
    document.getElementById('addPlaceSelect').value = c.placeId;
    onPlaceSelect();
    document.getElementById('addPlatform').value = c.platform;
    (c.channels||[]).forEach(ch => {
      const el = document.getElementById(`ach_${ch}`); if(el) el.checked = true;
    });
    document.getElementById('addContent').value = c.content;
    document.getElementById('addDeadline').value = c.deadline;
    document.getElementById('addHours').value = c.operatingHours || '';
    document.querySelectorAll('.day-item').forEach(d => {
      if ((c.operatingDays||[]).includes(d.textContent.trim())) d.classList.add('on');
    });
    const excludeEl = document.getElementById('addExcludeHoliday');
    if (excludeEl) excludeEl.checked = c.excludeHoliday || false;
    // 등록 버튼을 수정 모드로
    const btn = document.querySelector('.btn-submit');
    btn.textContent = '✅ 수정 완료';
    btn.onclick = async () => {
      c.platform = document.getElementById('addPlatform').value;
      c.channels = ['블로그','클립','인스타그램','유튜브'].filter(ch => document.getElementById(`ach_${ch}`)?.checked);
      c.content = document.getElementById('addContent').value.trim();
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
      adminToast('캠페인 수정 완료 ✅');
      btn.textContent = '✅ 등록하기';
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
const EXCEL_PLATFORM_OPTIONS = ['레뷰','리뷰노트','디너의여왕','서울오빠','리뷰플레이스','포블로그','링블','미블','강남맛집체험단','체험뷰','기타'];
const EXCEL_CHANNEL_OPTIONS = ['블로그','클립','인스타그램','유튜브'];
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
    if (!name || !address || !platform || !content || !deadline) { skipped++; continue; }

    const channels = String(channelRaw).split(',').map(s => s.trim()).filter(Boolean);
    const daysParsed = String(daysRaw || '').split(',').map(s => s.trim()).filter(Boolean);
    const operatingDays = daysParsed.length ? daysParsed : ['월','화','수','목','금','토','일'];
    const excludeHoliday = String(excludeHolidayRaw || '').trim().toUpperCase() === 'Y';

    // 기존 장소 or 신규
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
        content: String(content), deadline: String(deadline), link: '',
        operatingDays, operatingHours: String(hours) || '', excludeHoliday, source: 'admin'
      })
    });
    campaigns.push(await res.json());
    added++;
  }
  adminToast(`✅ ${added}개 등록 완료${skipped ? ` (${skipped}개 건너뜀)` : ''}`);
  btn.disabled = false;
  btn.textContent = '✅ 전체 가져오기';
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
    ['장소명','주소','카테고리','플랫폼','채널','협찬내용','마감일','영업시간','가능요일','공휴일불가'],
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

// ===== 자동 로그인 체크 =====
window.addEventListener('DOMContentLoaded', async () => {
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
