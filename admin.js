// ===== 무협맵 어드민 =====
// Firebase 연동 전: app.js의 places/campaigns 배열을 직접 공유

const ADMIN_PASSWORD = 'muhyeop2024'; // Firebase Auth로 교체 예정

// ===== 로그인 =====
function tryLogin() {
  const pw = document.getElementById('loginPassword').value;
  if (pw === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminLoggedIn', 'true');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
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
}

// ===== 초기화 =====
function initAdmin() {
  renderDashboard();
  populatePlaceSelect();
}

// ===== 대시보드 =====
function renderDashboard() {
  const today = new Date(); today.setHours(0,0,0,0);
  const active = campaigns.filter(c => new Date(c.deadline) >= today);
  const expired = campaigns.filter(c => new Date(c.deadline) < today);

  document.getElementById('statPlaces').textContent = places.length;
  document.getElementById('statCampaigns').textContent = campaigns.length;
  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statExpired').textContent = expired.length;

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

  // 마감 임박 (7일 이내)
  const d7 = new Date(today); d7.setDate(d7.getDate()+7);
  const urgent = active.filter(c => new Date(c.deadline) <= d7)
    .sort((a,b) => new Date(a.deadline)-new Date(b.deadline));
  document.getElementById('urgentList').innerHTML = urgent.length
    ? urgent.map(c => {
        const place = places.find(p => p.id === c.placeId);
        const diff = Math.ceil((new Date(c.deadline)-today)/(1000*60*60*24));
        return `<div class="urgent-item">
          <span class="urgent-place">${place?.name || '-'}</span>
          <span class="urgent-platform">${c.platform}</span>
          <span class="urgent-dl ${diff<=3?'red':''}">${diff === 0 ? 'D-Day' : `D-${diff}`} · ${c.deadline}</span>
        </div>`;
      }).join('')
    : '<div class="empty-msg">임박한 캠페인 없음</div>';
}

// ===== 캠페인 목록 =====
function renderCampaignList() {
  const today = new Date(); today.setHours(0,0,0,0);
  const statusFilter = document.getElementById('filterStatus').value;
  const platformFilter = document.getElementById('filterPlatform').value;

  let list = [...campaigns];
  if (statusFilter === 'active') list = list.filter(c => new Date(c.deadline) >= today);
  if (statusFilter === 'expired') list = list.filter(c => new Date(c.deadline) < today);
  if (platformFilter !== 'all') list = list.filter(c => c.platform === platformFilter);
  list.sort((a,b) => new Date(b.deadline)-new Date(a.deadline));

  const tbody = document.getElementById('campaignTableBody');
  tbody.innerHTML = list.map(c => {
    const place = places.find(p => p.id === c.placeId);
    const isActive = new Date(c.deadline) >= today;
    return `<tr class="${isActive ? '' : 'row-expired'}">
      <td class="td-id">${c.id}</td>
      <td><strong>${place?.name || '-'}</strong></td>
      <td><span class="badge-platform">${c.platform}</span></td>
      <td>${(c.channels||[]).join(', ')}</td>
      <td class="td-content">${c.content}</td>
      <td class="td-days">${(c.operatingDays||[]).join(' ')}${c.excludeHoliday ? ' / 공휴일 불가' : ''}</td>
      <td>${c.deadline}</td>
      <td><span class="badge-status ${isActive?'active':'expired'}">${isActive?'모집 중':'마감'}</span></td>
      <td>
        <button class="btn-edit-sm" onclick="editCampaign(${c.id})">수정</button>
        <button class="btn-del-sm" onclick="confirmDelete('campaign', ${c.id})">삭제</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty-msg">해당하는 캠페인 없음</td></tr>`;
}

// ===== 장소 목록 =====
function renderPlaceList() {
  const today = new Date(); today.setHours(0,0,0,0);
  const tbody = document.getElementById('placeTableBody');
  tbody.innerHTML = places.map(p => {
    const activeCnt = campaigns.filter(c => c.placeId === p.id && new Date(c.deadline) >= today).length;
    return `<tr>
      <td class="td-id">${p.id}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category}</td>
      <td class="td-addr">${p.address}</td>
      <td><span class="badge-count ${activeCnt>0?'active':''}">${activeCnt}개</span></td>
      <td>${p.founderNickname || '-'}</td>
      <td>
        <button class="btn-del-sm" onclick="confirmDelete('place', ${p.id})">삭제</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-msg">등록된 장소 없음</td></tr>`;
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

function submitAdminCampaign() {
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
    placeId = nextPlaceId++;
    places.push({ id: placeId, name, address, lat, lng, category, founderNickname: '', founderUrl: '' });
    adminToast(`장소 "${name}" 등록 완료`);
  }

  const excludeHoliday = document.getElementById('addExcludeHoliday')?.checked || false;
  campaigns.push({
    id: nextCampaignId++, placeId, platform, channels, content, deadline, link: '',
    operatingDays: days, operatingHours: hours, excludeHoliday,
    reporterNickname: '', reporterBlog: '', reporterInstagram: ''
  });

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
    : `장소 "${places.find(p=>p.id===id)?.name}"`;
  document.getElementById('confirmMsg').textContent = `${name}을 삭제할까요?`;
  document.getElementById('confirmModal').style.display = 'flex';
  confirmCallback = () => {
    if (type === 'campaign') {
      const idx = campaigns.findIndex(c => c.id === id);
      if (idx > -1) campaigns.splice(idx, 1);
      adminToast('캠페인 삭제 완료');
      renderCampaignList();
    } else {
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
    btn.onclick = () => {
      c.platform = document.getElementById('addPlatform').value;
      c.channels = ['블로그','클립','인스타그램','유튜브'].filter(ch => document.getElementById(`ach_${ch}`)?.checked);
      c.content = document.getElementById('addContent').value.trim();
      c.deadline = document.getElementById('addDeadline').value;
      c.operatingHours = document.getElementById('addHours').value.trim();
      c.operatingDays = [...document.querySelectorAll('.day-item.on')].map(el => el.textContent.trim());
      c.excludeHoliday = document.getElementById('addExcludeHoliday')?.checked || false;
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

function processExcelFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(e.target.result, { type: 'binary' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) { adminToast('데이터가 없어요'); return; }
    const headers = data[0];
    parsedRows = data.slice(1).filter(row => row.some(v => v !== ''));
    renderExcelPreview(headers, parsedRows);
  };
  reader.readAsBinaryString(file);
}

function renderExcelPreview(headers, rows) {
  document.getElementById('previewSection').style.display = 'block';
  document.getElementById('previewCount').textContent = `${rows.length}행 감지`;
  document.getElementById('previewHead').innerHTML =
    '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  document.getElementById('previewBody').innerHTML = rows.slice(0, 10).map(row =>
    '<tr>' + row.map(v => `<td>${v}</td>`).join('') + '</tr>'
  ).join('') + (rows.length > 10 ? `<tr><td colspan="${headers.length}" style="text-align:center;color:#aaa">...외 ${rows.length-10}행</td></tr>` : '');
}

function importExcelData() {
  let added = 0, skipped = 0;
  parsedRows.forEach(row => {
    const [name, address, latRaw, lngRaw, category, platform, channelRaw, content, deadline, hours] = row;
    if (!name || !platform || !content || !deadline) { skipped++; return; }

    const lat = parseFloat(latRaw) || 0;
    const lng = parseFloat(lngRaw) || 0;
    const channels = String(channelRaw).split(',').map(s => s.trim()).filter(Boolean);

    // 기존 장소 or 신규
    let place = places.find(p => p.name.replace(/\s/g,'') === String(name).replace(/\s/g,''));
    if (!place) {
      place = { id: nextPlaceId++, name: String(name), address: String(address), lat, lng,
        category: String(category) || '기타', founderNickname: '', founderUrl: '' };
      places.push(place);
    }

    campaigns.push({
      id: nextCampaignId++, placeId: place.id, platform: String(platform), channels,
      content: String(content), deadline: String(deadline), link: '',
      operatingDays: [], operatingHours: String(hours) || '',
      reporterNickname: '', reporterBlog: '', reporterInstagram: ''
    });
    added++;
  });
  adminToast(`✅ ${added}개 등록 완료${skipped ? ` (${skipped}개 건너뜀)` : ''}`);
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
    ['장소명','주소','위도','경도','카테고리','플랫폼','채널','협찬내용','마감일','영업시간'],
    ['스시코우지 강남','서울 강남구 테헤란로 152','37.5000','127.0370','음식점','레뷰','블로그,클립','오마카세 1인 체험','2026-07-31','12:00~22:00'],
    ['카페 노티드 청담','서울 강남구 압구정로 428','37.5247','127.0430','카페','미블','인스타그램','음료 2잔 체험','2026-07-15','10:00~22:00'],
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
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('adminLoggedIn') === 'true') {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    initAdmin();
  }
  // 엔터키 로그인
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin();
  });
});
