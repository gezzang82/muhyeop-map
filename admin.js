// ===== 무협맵 어드민 =====
// app.js의 places/campaigns 배열을 공유하며, 변경 시 /api/places, /api/campaigns로 동기화

const dataReady = loadInitialData();

// ===== 로그인 (서버 검증: 비밀번호는 서버 환경변수 ADMIN_PASSWORD와 비교, 어드민 쿠키 발급) =====
async function tryLogin() {
  const pw = document.getElementById('loginPassword').value;
  try {
    const res = await fetch('/api/auth/login?admin=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    if (!res.ok) {
      document.getElementById('loginError').textContent = '비밀번호가 올바르지 않아요.';
      document.getElementById('loginPassword').value = '';
      return;
    }
    sessionStorage.setItem('adminLoggedIn', 'true');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    await dataReady;
    initAdmin();
  } catch (e) {
    document.getElementById('loginError').textContent = '로그인 중 오류가 발생했어요.';
  }
}

async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  sessionStorage.removeItem('adminLoggedIn');
  location.reload();
}

// 비밀번호 표시/숨김 토글
function toggleLoginPw() {
  const inp = document.getElementById('loginPassword');
  const use = document.querySelector('#loginEye use');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  if (use) use.setAttribute('href', show ? '#icon-eye-off' : '#icon-eye');
  inp.focus();
}

// ===== 탭 전환 =====
function showTab(tab) {
  document.querySelectorAll('.admin-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + tab).style.display = 'block';
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'register') {
    // 캠페인 수정 모드로 진입했다가 다른 탭을 거쳐 다시 등록 탭으로 오면 초기화(등록 화면으로)
    if (campaignEditMode) { resetAddForm(); showSubtab('register', 'add'); }
    populatePlaceSelect();
  }
  if (tab === 'view') { renderPlaceList(); renderCampaignList(); }
  if (tab === 'banners') renderBannerList();
  if (tab === 'reports') renderReportList();
  if (tab === 'reviews') renderReviewList();
  if (tab === 'users') renderUserList();
}

// ===== 데이터 수집 (Phase 2) =====
let collectStagedRows = [];
let collectSub = 'pending';
function renderCollect() {
  collectShowSub('pending');
}
function collectShowSub(sub) {
  collectSub = sub;
  ['pending', 'registered', 'rejected', 'runs'].forEach(s => {
    const el = document.getElementById('collectSub-' + s);
    if (el) el.classList.toggle('active', s === sub);
  });
  const runs = sub === 'runs';
  document.getElementById('collectStagedWrap').style.display = runs ? 'none' : 'block';
  document.getElementById('collectRunsWrap').style.display = runs ? 'block' : 'none';
  if (runs) loadCollectRuns(); else loadStaged(sub);
}
async function collectScrape() {
  const btn = document.getElementById('collectBtn');
  const statusEl = document.getElementById('collectStatus');
  if (btn.disabled) return;
  btn.disabled = true;
  statusEl.textContent = '수집 중… (플랫폼 접속·파싱, 최대 1~2분)';
  const platform = document.getElementById('collectPlatform').value;
  const mode = document.getElementById('collectMode').value;
  const region = document.getElementById('collectRegion')?.value || '서울';
  const limit = document.getElementById('collectLimit').value || 20;
  const reset = document.getElementById('collectReset')?.checked ? '&reset=1' : '';
  try {
    const res = await fetch(`/api/campaigns?action=scrape&platform=${platform}&mode=${encodeURIComponent(mode)}&region=${encodeURIComponent(region)}&limit=${limit}${reset}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '수집 실패');
    statusEl.textContent = `${data.region ? '[' + data.region + '] ' : ''}신규 ${data.staged}건 적재 (처리 ${data.processed} · 제외 ${data.excluded} · 중복 ${data.dupActive || 0}). 커서 ${data.cursorFrom}→${data.cursorTo}`;
    collectShowSub('pending');
  } catch (e) {
    statusEl.textContent = '오류: ' + e.message;
  } finally {
    btn.disabled = false;
    const rst = document.getElementById('collectReset'); if (rst) rst.checked = false; // 리셋은 1회성
  }
}
async function collectReparse(only) {
  const platform = document.getElementById('collectPlatform').value;
  const statusEl = document.getElementById('collectStatus');
  const btn = document.getElementById(only === 'deadline' ? 'collectFixDdlBtn' : 'collectReparseBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  const label = only === 'deadline' ? '마감일 보정' : '검수 재파싱';
  statusEl.textContent = `${label} 중… (승인 대기 항목 원문 다시 읽는 중)`;
  try {
    const res = await fetch(`/api/campaigns?action=reparse&platform=${platform}${only ? '&only=' + only : ''}`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || '실패');
    statusEl.textContent = `${label} 완료: ${d.updated}/${d.pending}건 갱신`;
    collectShowSub('pending');
  } catch (e) {
    statusEl.textContent = '오류: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}
async function loadStaged(status) {
  const res = await fetch(`/api/campaigns?action=staged&status=${status}`);
  collectStagedRows = res.ok ? await res.json() : [];
  renderStagedRows();
}
const DEDUPE_LABEL = { new_place: '신규매장', add_channel: '+채널', renew: '갱신' };
let collectEditingId = null;
const esc = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
function renderStagedRows() {
  const body = document.getElementById('collectStagedBody');
  const cnt = document.getElementById('collectCount');
  if (cnt) cnt.textContent = collectStagedRows.length;
  // 마감일 임박순 정렬(빈 값은 뒤로)
  collectStagedRows.sort((a, b) => (a.deadline || '9999-99-99').localeCompare(b.deadline || '9999-99-99'));
  // 승인 대기 서브탭에서만 일괄선택/선택반려 노출
  const showBulk = collectSub === 'pending';
  const bulkBtn = document.getElementById('bulkRejectBtn');
  if (bulkBtn) bulkBtn.style.display = showBulk ? '' : 'none';
  const selAll = document.getElementById('stagedSelectAll');
  if (selAll) { selAll.checked = false; selAll.style.visibility = showBulk ? '' : 'hidden'; }
  if (!collectStagedRows.length) {
    body.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#aaa;padding:24px;">${collectSub === 'pending' ? '승인 대기 항목이 없어요. 위에서 수집을 실행하세요.' : '항목이 없어요.'}</td></tr>`;
    updateBulkRejectCount();
    return;
  }
  const inp = (id, val, w) => `<input id="${id}" value="${esc(val)}" style="width:${w || 100}px;padding:4px;border:1px solid #ccc;border-radius:6px;font-size:12px;">`;
  body.innerHTML = collectStagedRows.map(r => {
    const badge = DEDUPE_LABEL[r.dedupe_status] || r.dedupe_status || '';
    if (r.id === collectEditingId) {
      const catOpts = EXCEL_CATEGORY_OPTIONS.map(o => `<option value="${o}"${o === r.category ? ' selected' : ''}>${o}</option>`).join('');
      return `<tr style="background:#fffbe9;">
        <td></td>
        <td>${inp('ed-name-' + r.id, r.name, 120)}<div style="margin-top:4px;">${inp('ed-addr-' + r.id, r.address, 160)}</div></td>
        <td><select id="ed-cat-${r.id}" class="excel-cell-select" style="font-size:12px;">${catOpts}</select></td>
        <td>${inp('ed-ch-' + r.id, r.channel, 90)}</td>
        <td>${inp('ed-content-' + r.id, r.content, 200)}</td>
        <td>${inp('ed-deadline-' + r.id, r.deadline, 90)}</td>
        <td>${inp('ed-days-' + r.id, r.days, 110)}</td>
        <td>${inp('ed-hours-' + r.id, r.hours, 150)}</td>
        <td><input type="checkbox" id="ed-holiday-${r.id}"${r.exclude_holiday ? ' checked' : ''}></td>
        <td><span class="badge-status">${badge}</span></td>
        <td style="font-size:12px;color:#c47f00;">${r.flags || ''}</td>
        <td style="white-space:nowrap;"><button class="btn-dark" style="padding:4px 10px;" onclick="saveStaged(${r.id})">저장</button> <button class="btn-ghost" style="padding:4px 10px;" onclick="cancelStaged()">취소</button></td>
      </tr>`;
    }
    const actions = collectSub === 'pending'
      ? `<button class="btn-dark" style="padding:4px 10px;" onclick="approveStaged(${r.id})">승인</button> <button class="btn-ghost" style="padding:4px 10px;" onclick="editStaged(${r.id})">수정</button> <button class="btn-ghost" style="padding:4px 10px;color:#E82A2D;" onclick="rejectStaged(${r.id})">반려</button>`
      : (r.status === 'registered' ? '<span style="color:#1a9d4b;">등록됨</span>' : '<span style="color:#E82A2D;">반려됨</span>');
    const checkCell = collectSub === 'pending'
      ? `<td><input type="checkbox" class="staged-check" value="${r.id}" onchange="updateBulkRejectCount()"></td>`
      : '<td></td>';
    return `<tr>
      ${checkCell}
      <td><a href="${r.source_url}" target="_blank" style="color:#333;">${r.name || ''}</a></td>
      <td>${r.category || ''}</td>
      <td>${r.channel || '<span style="color:#E82A2D;">?</span>'}</td>
      <td style="max-width:220px;">${r.content || ''}</td>
      <td>${r.deadline || ''}</td>
      <td>${r.days || ''}</td>
      <td style="max-width:180px;font-size:12px;color:#666;">${r.hours || ''}</td>
      <td>${r.exclude_holiday ? 'Y' : ''}</td>
      <td><span class="badge-status">${badge}</span></td>
      <td style="font-size:12px;color:#c47f00;">${r.flags || ''}</td>
      <td style="white-space:nowrap;">${actions}</td>
    </tr>`;
  }).join('');
}
function editStaged(id) { collectEditingId = id; renderStagedRows(); }
function cancelStaged() { collectEditingId = null; renderStagedRows(); }

// 디너의여왕 지역별 하위지역(_scrape.js AREA2_BY_REGION과 값이 정확히 일치해야 함)
const AREA2_BY_REGION = {
  '서울': ['강남/논현/압구정', '강동/천호', '강서/목동/마곡', '건대/왕십리', '관악/신림', '교대/사당', '노원/강북', '명동/이태원', '삼성/선릉', '서초/반포', '송파/잠실', '수유/동대문/중랑', '시청/남대문', '여의도/영등포/구로', '종로/대학로', '홍대/마포/신촌', '기타'],
  '경기': ['수원/화성/오산/평택', '의정부/동두천', '성남/판교', '광명/시흥', '과천/안양/안산', '남양주/구리/하남', '일산/파주/고양/김포/포천'],
};
// 지역에 따라 '범위' 드롭다운을 다시 채움. 서울: 전체/전역/하위지역, 경기: 전체/하위지역, 부산·인천: 전체만.
function onCollectRegionChange() {
  const region = document.getElementById('collectRegion')?.value || '서울';
  const modeSel = document.getElementById('collectMode');
  if (!modeSel) return;
  const prev = modeSel.value;
  let opts = '<option value="jeonche">전체(최신)</option>';
  if (region === '서울') opts += '<option value="all-seoul">서울 전역(하위지역 전체)</option>';
  const subs = AREA2_BY_REGION[region];
  if (subs) opts += `<optgroup label="${escHtml(region)} 하위지역">` + subs.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('') + '</optgroup>';
  modeSel.innerHTML = opts;
  // 이전 선택 유지(가능하면)
  if ([...modeSel.options].some(o => o.value === prev)) modeSel.value = prev;
  else modeSel.value = 'jeonche';
  // 커스텀 셀렉트(enhanceSelects) 트리거 라벨 동기화(메뉴는 열 때 옵션을 다시 읽어 자동 반영)
  if (modeSel._cselectSync) modeSel._cselectSync();
}

// ===== 승인 대기 일괄 반려 =====
function updateBulkRejectCount() {
  const n = document.querySelectorAll('.staged-check:checked').length;
  const el = document.getElementById('bulkRejectCount'); if (el) el.textContent = n;
}
function toggleStagedSelectAll(cb) {
  document.querySelectorAll('.staged-check').forEach(c => { c.checked = cb.checked; });
  updateBulkRejectCount();
}
async function bulkRejectStaged() {
  const ids = [...document.querySelectorAll('.staged-check:checked')].map(c => Number(c.value)).filter(Boolean);
  if (!ids.length) { adminToast('반려할 항목을 선택하세요.'); return; }
  if (!confirm(`선택한 ${ids.length}건을 반려할까요? (반려 탭으로 이동, 지도엔 안 올라감)`)) return;
  const btn = document.getElementById('bulkRejectBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/campaigns?action=bulkreview', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: 'rejected' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '반려 실패');
    adminToast(`${data.count}건 반려 완료`);
    await loadStaged('pending');
  } catch (e) {
    adminToast('오류: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function saveStaged(id) {
  const g = (k) => document.getElementById(`ed-${k}-${id}`);
  const payload = {
    name: g('name').value.trim(), address: g('addr').value.trim(), category: g('cat').value,
    channel: g('ch').value.trim(), content: g('content').value.trim(), deadline: g('deadline').value.trim(),
    days: g('days').value.trim(), hours: g('hours').value.trim(), excludeHoliday: g('holiday').checked
  };
  await fetch(`/api/campaigns?action=editstaged&id=${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const row = collectStagedRows.find(x => x.id === id);
  if (row) Object.assign(row, { name: payload.name, address: payload.address, category: payload.category, channel: payload.channel, content: payload.content, deadline: payload.deadline, days: payload.days, hours: payload.hours, exclude_holiday: payload.excludeHoliday ? 1 : 0 });
  collectEditingId = null;
  renderStagedRows();
  adminToast('수정 저장됨');
}
async function approveStaged(id) {
  const r = collectStagedRows.find(x => x.id === id);
  if (!r) return;
  const channels = String(r.channel || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!channels.length) { adminToast('채널이 비어 있어요. 플랫폼 페이지 확인 후 수동 등록하거나 반려하세요.'); return; }
  const operatingDays = String(r.days || '').split(',').map(s => s.trim()).filter(Boolean);
  try {
    let place = places.find(p => p.name.replace(/\s/g, '') === String(r.name).replace(/\s/g, ''));
    if (!place) {
      const coords = await geocodeAddress(String(r.address));
      if (!coords) { adminToast(`좌표 변환 실패: ${r.address} — 주소 확인 필요`); return; }
      const pres = await fetch('/api/places', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: String(r.name), address: String(r.address), lat: coords.lat, lng: coords.lng, category: r.category || '기타' })
      });
      place = await pres.json();
      places.push(place);
    }
    const cres = await fetch('/api/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId: place.id, platform: r.platform || '디너의여왕', channels, content: r.content,
        deadline: r.deadline || '', link: r.source_url || '', operatingDays,
        operatingHours: r.hours || '', excludeHoliday: !!r.exclude_holiday, source: 'admin'
      })
    });
    const camp = await cres.json();
    await fetch(`/api/campaigns?action=review&id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'registered', createdCampaignId: camp.id })
    });
    adminToast(`등록 완료: ${r.name}`);
    collectStagedRows = collectStagedRows.filter(x => x.id !== id);
    renderStagedRows();
  } catch (e) {
    adminToast('등록 실패: ' + e.message);
  }
}
async function rejectStaged(id) {
  await fetch(`/api/campaigns?action=review&id=${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'rejected' })
  });
  collectStagedRows = collectStagedRows.filter(x => x.id !== id);
  renderStagedRows();
}
async function loadCollectRuns() {
  const res = await fetch('/api/campaigns?action=runs');
  const runs = res.ok ? await res.json() : [];
  const body = document.getElementById('collectRunsBody');
  body.innerHTML = runs.length ? runs.map(r => `<tr>
    <td>${r.id}</td><td>${r.run_at || ''}</td><td>${r.cursor_from}→${r.cursor_to}</td>
    <td>${r.fetched}</td><td>${r.staged}</td><td>${r.excluded}</td>
    <td style="font-size:12px;color:#666;">${r.note || ''}</td></tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:24px;">수집 이력이 없어요.</td></tr>';
}

// 조회(매장/캠페인) · 등록(등록/엑셀) 서브탭 전환
function showSubtab(group, key) {
  if (group === 'register') {
    ['add', 'excel', 'collect'].forEach(k => {
      document.getElementById('sub-reg-' + k).style.display = k === key ? 'block' : 'none';
      document.getElementById('subtab-reg-' + k).classList.toggle('active', k === key);
    });
    if (key === 'add') populatePlaceSelect();
    if (key === 'collect') renderCollect();
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
    sel.setAttribute('data-cselect', '1');
    // 엑셀 미리보기처럼 스크롤 컨테이너 안에 있는 셀렉트는 메뉴를 fixed로 띄워 잘림을 피한다
    const isExcel = sel.classList.contains('excel-cell-select');
    const wrap = document.createElement('div');
    wrap.className = 'cselect' + (isExcel ? ' excel-cselect' : '');
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
      if (willOpen) {
        build();
        wrap.classList.add('open');
        if (isExcel) positionFixedCselectMenu(trigger, menu);
      }
    });
    sel._cselectSync = sync;
    sync();
  });
}
// fixed 메뉴 위치를 트리거 기준으로 계산 (스크롤 컨테이너 overflow 잘림 회피)
function positionFixedCselectMenu(trigger, menu) {
  const r = trigger.getBoundingClientRect();
  const maxH = 240;
  const below = window.innerHeight - r.bottom;
  menu.style.position = 'fixed';
  menu.style.left = r.left + 'px';
  menu.style.width = r.width + 'px';
  menu.style.right = 'auto';
  if (below < maxH && r.top > below) {
    // 아래 공간이 부족하면 위로 띄움
    menu.style.top = 'auto';
    menu.style.bottom = (window.innerHeight - r.top + 4) + 'px';
  } else {
    menu.style.bottom = 'auto';
    menu.style.top = (r.bottom + 4) + 'px';
  }
}
function refreshAdminSelects() {
  document.querySelectorAll('select[data-cselect]').forEach(s => s._cselectSync && s._cselectSync());
}
function closeAllCselects() {
  document.querySelectorAll('.cselect.open').forEach(o => o.classList.remove('open'));
}
document.addEventListener('click', closeAllCselects);
// 스크롤 시 fixed 메뉴가 제자리에 남지 않도록 닫음 (캡처로 내부 스크롤 컨테이너까지 감지).
// 단, 메뉴 자체를 스크롤하는 경우(옵션이 많아 내부 스크롤)는 닫지 않음.
window.addEventListener('scroll', (e) => {
  if (!document.querySelector('.cselect.open')) return;
  if (e.target && e.target.closest && e.target.closest('.cselect-menu')) return;
  closeAllCselects();
}, true);

// ===== 초기화 =====
function initAdmin() {
  renderDashboard();
  populatePlaceSelect();
  enhanceSelects();
  onCollectRegionChange(); // 수집 '범위' 드롭다운을 현재 지역 기준으로 채움(서울=하위지역 포함)
}

// 방문 추이 막대그래프. series=[{label,pv,uv}](과거→현재 정렬). PV 막대 안에 UV를 브랜드컬러로 채워 비중 표시.
function renderVisitChart(series) {
  const el = document.getElementById('visitChart');
  if (!el) return;
  const days = series || [];
  if (!days.length) { el.innerHTML = '<div class="empty-msg">아직 방문 데이터가 없어요.</div>'; return; }
  const maxPv = Math.max(1, ...days.map(d => d.pv || 0));
  el.innerHTML = days.map(d => {
    const pv = d.pv || 0, uv = d.uv || 0;
    const pvH = Math.round(pv / maxPv * 100);
    const uvH = pv ? Math.round(uv / pv * 100) : 0;
    return `<div class="vc-col" title="${d.label} · PV ${pv} · UV ${uv}">
        <div class="vc-val">${pv}</div>
        <div class="vc-bar"><div class="vc-bar-pv" style="height:${pvH}%"><div class="vc-bar-uv" style="height:${uvH}%"></div></div></div>
        <div class="vc-label">${d.label}</div>
      </div>`;
  }).join('');
}

// 유입경로 집계(누적). platform-stats 스타일 재사용(막대 + 개수).
function renderReferrers(refs) {
  const el = document.getElementById('referrerStats');
  if (!el) return;
  if (!refs || !refs.length) { el.innerHTML = '<div class="empty-msg">아직 유입 데이터가 없어요.</div>'; return; }
  const labelMap = { direct: '직접·앱', naver: '네이버', instagram: '인스타그램', google: '구글', daum: '다음', kakao: '카카오', youtube: '유튜브', facebook: '페이스북', daangn: '당근' };
  const max = Math.max(1, ...refs.map(r => r.cnt || 0));
  el.innerHTML = refs.map(r => `
      <div class="stat-row">
        <span class="stat-badge" style="background:#39395c1a;color:#39395c">${labelMap[r.ref] || escHtml(r.ref)}</span>
        <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.round((r.cnt || 0) / max * 100)}%;background:#39395c"></div></div>
        <span class="stat-num">${r.cnt || 0}</span>
      </div>`).join('');
}

// 방문 추이 기간 토글(일별/주별/월별)
let _visitPeriod = 'day';
function setVisitPeriod(period, btn) {
  _visitPeriod = period;
  document.querySelectorAll('.vc-period-btn').forEach(b => b.classList.toggle('active', b === btn));
  fetch(`/api/places?visit=stats&period=${period}`).then(r => r.json())
    .then(s => renderVisitChart(s.series || [])).catch(() => {});
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

  // 사이트 방문 집계(오늘 PV/UV, 누적 PV) + 현재 선택된 기간의 추이 그래프
  fetch(`/api/places?visit=stats&period=${_visitPeriod}`).then(r => r.json()).then(s => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = (v || 0).toLocaleString(); };
    set('statVisitTodayPv', s.todayPv);
    set('statVisitTodayUv', s.todayUv);
    set('statVisitTotalPv', s.totalPv);
    renderVisitChart(s.series || []);
    renderReferrers(s.referrers || []);
  }).catch(() => {});

  // 마감 임박 (D-DAY ~ D-4): 활성 캠페인을 마감까지 남은 일수별로 집계. 상시(마감일 없음)는 제외.
  const DAY_MS = 86400000;
  const ddayStatsEl = document.getElementById('ddayStats');
  if (ddayStatsEl) {
    const labels = ['D-DAY', 'D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6', 'D-7'];
    ddayStatsEl.innerHTML = labels.map((label, n) => {
      const cnt = active.filter(c => (deadlineToUTC(c.deadline) - today) === n * DAY_MS).length;
      return `<div class="dday-cell${n === 0 ? ' dday-today' : ''}">
        <span class="dday-label">${label}</span>
        <span class="dday-count">${cnt}</span>
      </div>`;
    }).join('');
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

// 플랫폼별 색상 태그 / 채널 아이콘 (조회 캠페인용). 색상맵은 app.js의 getPlatformColor 재사용
function platformTag(p) {
  if (!p) return '-';
  const color = (typeof getPlatformColor === 'function') ? getPlatformColor(p) : '#666';
  return `<span class="badge-platform" style="background:${color}1a;color:${color}">${escHtml(p)}</span>`;
}
const CHANNEL_ICON = { '블로그':'ic_naver_blog_20.png','클립':'ic_clip_20.png','인스타그램':'ic_instagram_20.png','릴스':'ic_reels_20.png','유튜브':'ic_youtube_20.png' };
function channelIcons(channels) {
  const list = (channels || []).filter(Boolean);
  if (!list.length) return '-';
  return `<span class="ch-icons">${list.map(ch => CHANNEL_ICON[ch]
    ? `<img class="ch-icon" src="image/${CHANNEL_ICON[ch]}" width="20" height="20" alt="${escHtml(ch)}" title="${escHtml(ch)}">`
    : escHtml(ch)).join('')}</span>`;
}

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
      <td>${platformTag(c.platform)}</td>
      <td>${channelIcons(c.channels)}</td>
      <td class="td-content">${escHtml(c.content)}</td>
      <td class="td-days">${(c.operatingDays || []).join(' ')}${c.excludeHoliday ? ' / 공휴일 불가' : ''}</td>
      <td>${c.deadline || '-'}</td>
      <td>${escHtml(c.reporterNickname) || '-'}</td>
      <td>${escHtml(c.reporterEmail) || '-'}</td>
      <td>${c.source === 'user' ? '<span class="badge-status user">유저</span>' : c.source === 'admin' ? '<span class="badge-status expired">어드민</span>' : '-'}</td>
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
// 매장 상태 3분류: 숨김(강제) > 노출(진행중 캠페인 있음) > 마감(진행중 캠페인 없음)
function placeStatusText(p) {
  if (p.hidden) return '숨김';
  return p.activeCount > 0 ? '노출' : '마감';
}
function placeStatusBadge(p) {
  if (p.hidden) return '<span class="place-status">숨김</span>';
  return p.activeCount > 0
    ? '<span class="place-status">노출</span>'
    : '<span class="place-status closed">마감</span>';
}

function renderPlaceRows() {
  document.getElementById('placeTableBody').innerHTML = placeView.rows.map(p => `<tr>
    <td class="td-check"><input type="checkbox" class="pv-check" data-id="${p.id}" onchange="onRowCheck('place')"></td>
    <td class="td-id">${p.id}</td>
    <td><strong>${escHtml(p.name)}</strong></td>
    <td>${escHtml(p.category)}</td>
    <td class="td-addr">${escHtml(p.address)}</td>
    <td><span class="badge-count ${p.activeCount > 0 ? 'active' : ''}">${p.activeCount}개</span></td>
    <td>${placeStatusBadge(p)}</td>
    <td>${escHtml(p.founderNickname) || '-'}</td>
    <td>${escHtml(p.founderEmail) || '-'}</td>
    <td>
      <div class="row-actions">
        <button class="btn-edit-sm" onclick="openEditPlaceModal(${p.id})">수정</button>
        <button class="btn-edit-sm" onclick="togglePlaceHidden(${p.id})">${p.hidden ? '노출' : '숨김'}</button>
        <button class="btn-del-sm" onclick="confirmDelete('place', ${p.id})">삭제</button>
      </div>
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
    st.rows.forEach(p => aoa.push([p.id, p.name, p.category, p.address, p.activeCount, placeStatusText(p), p.founderNickname || '', p.founderEmail || '']));
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

// ===== 범용 달력 (배너 시작/종료일) =====
const GCAL = {
  bs: { picker: 'bsDatePicker', trigger: 'bsTrigger', text: 'bsText', hidden: 'bannerStartDate', year: 'bsYear', month: 'bsMonth', grid: 'bsGrid' },
  be: { picker: 'beDatePicker', trigger: 'beTrigger', text: 'beText', hidden: 'bannerEndDate', year: 'beYear', month: 'beMonth', grid: 'beGrid' }
};
const _gcalView = {};
function gcalSetValue(prefix, v) {
  const c = GCAL[prefix];
  document.getElementById(c.hidden).value = v || '';
  const text = document.getElementById(c.text);
  const trigger = document.getElementById(c.trigger);
  if (v) { text.textContent = v; trigger.classList.remove('placeholder'); }
  else { text.textContent = 'YYYY-MM-DD'; trigger.classList.add('placeholder'); }
}
function gcalToggle(prefix, e) {
  if (e) e.stopPropagation();
  const wrap = document.getElementById(GCAL[prefix].picker);
  Object.values(GCAL).forEach(g => { if (g.picker !== GCAL[prefix].picker) document.getElementById(g.picker)?.classList.remove('open'); });
  const open = wrap.classList.toggle('open');
  if (open) {
    const cur = document.getElementById(GCAL[prefix].hidden).value;
    const base = cur ? new Date(cur) : new Date();
    _gcalView[prefix] = { year: base.getFullYear(), month: base.getMonth() };
    gcalRender(prefix);
  }
}
function gcalNav(prefix, delta) {
  const v = _gcalView[prefix];
  v.month += delta;
  if (v.month < 0) { v.month = 11; v.year--; } else if (v.month > 11) { v.month = 0; v.year++; }
  gcalRender(prefix);
}
function gcalRender(prefix) {
  const c = GCAL[prefix]; const v = _gcalView[prefix];
  document.getElementById(c.year).textContent = v.year;
  document.getElementById(c.month).textContent = String(v.month + 1).padStart(2, '0');
  const selected = document.getElementById(c.hidden).value;
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const firstDow = new Date(v.year, v.month, 1).getDay();
  const daysInMonth = new Date(v.year, v.month + 1, 0).getDate();
  const daysPrev = new Date(v.year, v.month, 0).getDate();
  let html = '';
  for (let i = firstDow - 1; i >= 0; i--) html += `<button type="button" class="cdate-cell muted" disabled>${daysPrev - i}</button>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${v.year}-${String(v.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = ['cdate-cell'];
    if (ds === todayStr) cls.push('today');
    if (ds === selected) cls.push('selected');
    html += `<button type="button" class="${cls.join(' ')}" onclick="gcalPick('${prefix}','${ds}')">${d}</button>`;
  }
  const trail = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  for (let i = 1; i <= trail; i++) html += `<button type="button" class="cdate-cell muted" disabled>${i}</button>`;
  document.getElementById(c.grid).innerHTML = html;
}
function gcalPick(prefix, ds) {
  gcalSetValue(prefix, ds);
  document.getElementById(GCAL[prefix].picker).classList.remove('open');
}
document.addEventListener('click', (e) => {
  Object.values(GCAL).forEach(g => {
    const wrap = document.getElementById(g.picker);
    if (wrap && wrap.classList.contains('open') && !wrap.contains(e.target)) wrap.classList.remove('open');
  });
});

// ===== 이벤트 팝업 =====
const bannerView = { page: 1, size: 100 };
let bannerEditId = null;

function renderBannerList() {
  const today = getKSTTodayUTC();
  const tbody = document.getElementById('bannerTableBody');
  const sizeEl = document.getElementById('bvSize');
  if (sizeEl) bannerView.size = parseInt(sizeEl.value, 10) || 100;
  const total = banners.length;
  const totalPages = Math.max(1, Math.ceil(total / bannerView.size));
  if (bannerView.page > totalPages) bannerView.page = totalPages;
  const start = (bannerView.page - 1) * bannerView.size;
  const pageRows = banners.slice(start, start + bannerView.size);
  tbody.innerHTML = pageRows.map(b => {
    const inPeriod = deadlineToUTC(b.startDate) <= today && today <= deadlineToUTC(b.endDate);
    const statusHtml = b.hidden
      ? '<span class="badge-status expired">숨김</span>'
      : `<span class="badge-status ${inPeriod ? 'active' : 'expired'}">${inPeriod ? '노출 중' : '기간 외'}</span>`;
    return `<tr>
      <td class="td-id">${b.id}</td>
      <td><img src="${escHtml(b.imageUrl)}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:6px;"></td>
      <td>${escHtml(b.linkUrl) || '-'}</td>
      <td>${b.startDate}</td>
      <td>${b.endDate}</td>
      <td>${statusHtml}</td>
      <td>
        <div class="row-actions">
          <button class="btn-edit-sm" onclick="editBanner(${b.id})">수정</button>
          <button class="btn-edit-sm" onclick="toggleBannerHidden(${b.id})">${b.hidden ? '노출' : '숨김'}</button>
          <button class="btn-del-sm" onclick="confirmDelete('banner', ${b.id})">삭제</button>
        </div>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-msg">등록된 팝업 없음</td></tr>`;
  const totalEl = document.getElementById('bvTotal'); if (totalEl) totalEl.textContent = total;
  const shownEl = document.getElementById('bvShown'); if (shownEl) shownEl.textContent = pageRows.length;
  renderBannerPager(totalPages);
}
function renderBannerPager(totalPages) {
  const pager = document.getElementById('bvPager');
  if (!pager) return;
  if (totalPages <= 1) { pager.innerHTML = ''; return; }
  const p = bannerView.page;
  const s = Math.max(1, Math.min(p - 2, totalPages - 4));
  const e = Math.min(totalPages, s + 4);
  let html = `<button ${p === 1 ? 'disabled' : ''} onclick="gotoBannerPage(1)">&laquo;</button><button ${p === 1 ? 'disabled' : ''} onclick="gotoBannerPage(${p - 1})">&lsaquo;</button>`;
  for (let i = s; i <= e; i++) html += `<button class="${i === p ? 'active' : ''}" onclick="gotoBannerPage(${i})">${i}</button>`;
  html += `<button ${p === totalPages ? 'disabled' : ''} onclick="gotoBannerPage(${p + 1})">&rsaquo;</button><button ${p === totalPages ? 'disabled' : ''} onclick="gotoBannerPage(${totalPages})">&raquo;</button>`;
  pager.innerHTML = html;
}
function gotoBannerPage(p) { bannerView.page = p; renderBannerList(); }

function editBanner(id) {
  const b = banners.find(x => x.id === id);
  if (!b) return;
  bannerEditId = id;
  document.getElementById('bannerImageUrl').value = b.imageUrl;
  document.getElementById('bannerLinkUrl').value = b.linkUrl || '';
  gcalSetValue('bs', b.startDate);
  gcalSetValue('be', b.endDate);
  updateBannerPreview();
  document.getElementById('bannerSubmitBtn').textContent = '수정 완료';
  document.getElementById('bannerCancelBtn').style.display = '';
  document.getElementById('page-banners').scrollIntoView({ block: 'start' });
}

// 파일 첨부 → 640px 리사이즈 + JPEG 압축 → base64 data URI로 imageUrl 채움
// (별도 이미지 저장소 없이 DB의 image_url에 저장. 자동 리사이즈로 payload 최소화)
function handleBannerFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { adminToast('이미지 파일만 첨부할 수 있어요.'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX_W = 960;
      const scale = Math.min(1, MAX_W / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);      // 투명 배경은 흰색으로(JPEG는 투명 미지원)
      ctx.drawImage(img, 0, 0, w, h);
      const dataUri = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('bannerImageUrl').value = dataUri;
      updateBannerPreview();
      const kb = Math.round(dataUri.length * 0.75 / 1024);
      adminToast(`이미지 첨부됨 (${w}×${h}, ~${kb}KB)`);
    };
    img.onerror = () => adminToast('이미지를 불러오지 못했어요.');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateBannerPreview() {
  const url = (document.getElementById('bannerImageUrl').value || '').trim();
  const prev = document.getElementById('bannerPreview');
  if (!prev) return;
  if (url) { prev.src = url; prev.style.display = 'block'; }
  else { prev.removeAttribute('src'); prev.style.display = 'none'; }
}

function resetBannerForm() {
  bannerEditId = null;
  document.getElementById('bannerImageUrl').value = '';
  document.getElementById('bannerLinkUrl').value = '';
  const fileEl = document.getElementById('bannerImageFile');
  if (fileEl) fileEl.value = '';
  gcalSetValue('bs', '');
  gcalSetValue('be', '');
  updateBannerPreview();
  document.getElementById('bannerSubmitBtn').textContent = '등록하기';
  document.getElementById('bannerCancelBtn').style.display = 'none';
}

async function toggleBannerHidden(id) {
  const b = banners.find(x => x.id === id);
  if (!b) return;
  const nextHidden = !b.hidden;
  await fetch(`/api/banners?id=${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: nextHidden })
  });
  b.hidden = nextHidden;
  adminToast(nextHidden ? '팝업을 숨겼어요.' : '팝업 숨김을 해제했어요.');
  renderBannerList();
}

async function submitBanner() {
  const imageUrl = document.getElementById('bannerImageUrl').value.trim();
  const linkUrl = document.getElementById('bannerLinkUrl').value.trim();
  const startDate = document.getElementById('bannerStartDate').value;
  const endDate = document.getElementById('bannerEndDate').value;
  if (!imageUrl || !startDate || !endDate) {
    adminToast('이미지, 시작일, 종료일은 필수예요!'); return;
  }
  if (bannerEditId) {
    await fetch(`/api/banners?id=${bannerEditId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, linkUrl, startDate, endDate })
    });
    const b = banners.find(x => x.id === bannerEditId);
    if (b) Object.assign(b, { imageUrl, linkUrl, startDate, endDate });
    adminToast('이벤트 팝업 수정 완료');
  } else {
    const res = await fetch('/api/banners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, linkUrl, startDate, endDate })
    });
    banners.unshift(await res.json());
    adminToast('이벤트 팝업 등록 완료');
  }
  resetBannerForm();
  renderBannerList();
}

// ===== 회원 목록 =====
const PROVIDER_LABELS = { kakao: '카카오', naver: '네이버' };

// DB의 created_at은 UTC(datetime('now'))로 저장됨 → 어드민 표시는 한국시간(KST)으로 변환.
// SQLite 형식 'YYYY-MM-DD HH:MM:SS'(UTC)를 파싱해 Asia/Seoul 기준 'YYYY-MM-DD HH:MM'로 반환.
function fmtKST(dt) {
  if (!dt) return '-';
  const d = new Date(String(dt).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return dt;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

let allUsers = [];
const userView = { page: 1, size: 50, field: 'all', keyword: '' };

async function renderUserList() {
  allUsers = await (await fetch('/api/users')).json();
  userView.page = 1;
  renderUserRows();
}
function applyUserFilter() {
  userView.field = document.getElementById('uvField').value;
  userView.keyword = (document.getElementById('uvKeyword').value || '').trim().toLowerCase();
  userView.page = 1;
  renderUserRows();
}
function getFilteredUsers() {
  const { field, keyword } = userView;
  if (!keyword) return allUsers;
  return allUsers.filter(u => {
    const nick = (u.nickname || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const url = `${u.urlPlatform || ''} ${u.urlId || ''}`.toLowerCase();
    if (field === 'nickname') return nick.includes(keyword);
    if (field === 'email') return email.includes(keyword);
    if (field === 'url') return url.includes(keyword);
    return nick.includes(keyword) || email.includes(keyword) || url.includes(keyword);
  });
}
function renderUserRows() {
  const filtered = getFilteredUsers();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / userView.size));
  if (userView.page > totalPages) userView.page = totalPages;
  const start = (userView.page - 1) * userView.size;
  const pageRows = filtered.slice(start, start + userView.size);
  const tbody = document.getElementById('userTableBody');
  tbody.innerHTML = pageRows.map(u => `<tr>
      <td class="td-id">${u.id}</td>
      <td>${PROVIDER_LABELS[u.provider] || u.provider}</td>
      <td>${escHtml(u.nickname) || '-'}</td>
      <td>${escHtml(u.email) || '-'}</td>
      <td>${u.urlPlatform && u.urlId ? `${escHtml(u.urlPlatform)}: ${escHtml(u.urlId)}` : '-'}</td>
      <td>${u.reportCount != null ? u.reportCount : 0}</td>
      <td>${u.reviewCount != null ? u.reviewCount : 0}</td>
      <td>${u.visitCount != null ? u.visitCount : 0}</td>
      <td>${fmtKST(u.createdAt)}</td>
    </tr>`).join('') || `<tr><td colspan="9" class="empty-msg">${total ? '해당 페이지 없음' : '조건에 맞는 회원 없음'}</td></tr>`;
  renderUserPager(totalPages);
}
function renderUserPager(totalPages) {
  const pager = document.getElementById('uvPager');
  if (!pager) return;
  if (totalPages <= 1) { pager.innerHTML = ''; return; }
  const p = userView.page;
  const start = Math.max(1, Math.min(p - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  let html = '';
  html += `<button ${p === 1 ? 'disabled' : ''} onclick="gotoUserPage(1)">&laquo;</button>`;
  html += `<button ${p === 1 ? 'disabled' : ''} onclick="gotoUserPage(${p - 1})">&lsaquo;</button>`;
  for (let i = start; i <= end; i++) html += `<button class="${i === p ? 'active' : ''}" onclick="gotoUserPage(${i})">${i}</button>`;
  html += `<button ${p === totalPages ? 'disabled' : ''} onclick="gotoUserPage(${p + 1})">&rsaquo;</button>`;
  html += `<button ${p === totalPages ? 'disabled' : ''} onclick="gotoUserPage(${totalPages})">&raquo;</button>`;
  pager.innerHTML = html;
}
function gotoUserPage(p) { userView.page = p; renderUserRows(); }

// ===== 후기 관리 =====
let allReviews = [];
const reviewView = { page: 1, size: 100, field: 'all', keyword: '' };
async function renderReviewList() {
  allReviews = await (await fetch('/api/places?reviews=all')).json();
  reviewView.page = 1;
  renderReviewRows();
}
function applyReviewFilter() {
  reviewView.field = document.getElementById('rmField').value;
  reviewView.keyword = (document.getElementById('rmKeyword').value || '').trim().toLowerCase();
  reviewView.page = 1;
  renderReviewRows();
}
function getFilteredReviews() {
  const { field, keyword } = reviewView;
  if (!keyword) return allReviews;
  return allReviews.filter(r => {
    const place = (r.placeName || '').toLowerCase();
    const author = (r.author || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    if (field === 'place') return place.includes(keyword);
    if (field === 'author') return author.includes(keyword);
    if (field === 'title') return title.includes(keyword);
    return place.includes(keyword) || author.includes(keyword) || title.includes(keyword);
  });
}
function renderReviewRows() {
  reviewView.size = parseInt(document.getElementById('rmSize').value, 10) || 100;
  const filtered = getFilteredReviews();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / reviewView.size));
  if (reviewView.page > totalPages) reviewView.page = totalPages;
  const start = (reviewView.page - 1) * reviewView.size;
  const pageRows = filtered.slice(start, start + reviewView.size);
  const tbody = document.getElementById('reviewTableBody');
  tbody.innerHTML = pageRows.map(r => `<tr>
      <td class="td-id">${r.id}</td>
      <td>${escHtml(r.placeName) || '-'}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.title)}">${escHtml(r.title) || '-'}</td>
      <td>${escHtml(r.author) || '-'}</td>
      <td>${(r.postDate || r.createdAt || '').slice(0, 10) || '-'}</td>
      <td>${r.likeCount || 0}</td>
      <td>${r.clickCount || 0}</td>
      <td><a href="${escHtml(r.url)}" target="_blank" rel="noopener">블로그 열기</a></td>
      <td><span class="badge-status ${r.hidden ? 'expired' : 'active'}">${r.hidden ? '숨김' : '노출'}</span></td>
      <td>
        <button class="btn-edit-sm" onclick="toggleReviewHiddenAdmin(${r.id})">${r.hidden ? '노출' : '숨김'}</button>
        <button class="btn-del-sm" onclick="confirmDelete('review', ${r.id})">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="10" class="empty-msg">${total ? '해당 페이지 없음' : '조건에 맞는 후기 없음'}</td></tr>`;
  document.getElementById('rmTotal').textContent = allReviews.length;
  document.getElementById('rmShown').textContent = total;
  renderReviewPager(totalPages);
}
function renderReviewPager(totalPages) {
  const pager = document.getElementById('rmPager');
  if (!pager) return;
  if (totalPages <= 1) { pager.innerHTML = ''; return; }
  const p = reviewView.page;
  const start = Math.max(1, Math.min(p - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  let html = '';
  html += `<button ${p === 1 ? 'disabled' : ''} onclick="gotoReviewPage(1)">&laquo;</button>`;
  html += `<button ${p === 1 ? 'disabled' : ''} onclick="gotoReviewPage(${p - 1})">&lsaquo;</button>`;
  for (let i = start; i <= end; i++) html += `<button class="${i === p ? 'active' : ''}" onclick="gotoReviewPage(${i})">${i}</button>`;
  html += `<button ${p === totalPages ? 'disabled' : ''} onclick="gotoReviewPage(${p + 1})">&rsaquo;</button>`;
  html += `<button ${p === totalPages ? 'disabled' : ''} onclick="gotoReviewPage(${totalPages})">&raquo;</button>`;
  pager.innerHTML = html;
}
function gotoReviewPage(p) { reviewView.page = p; renderReviewRows(); }
async function toggleReviewHiddenAdmin(id) {
  const r = allReviews.find(x => x.id === id);
  if (!r) return;
  const nextHidden = !r.hidden;
  if (nextHidden && !confirm('이 후기를 지도에서 숨길까요? (언제든 다시 노출할 수 있어요)')) return;
  await fetch(`/api/places?reviews=&id=${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: nextHidden })
  });
  r.hidden = nextHidden;
  adminToast(nextHidden ? '후기를 숨김 처리했어요.' : '후기 숨김을 해제했어요.');
  renderReviewRows();
}

// ===== 신고 목록 =====
let reports = [];
let reportFilter = 'all';   // 신고 목록 유형 필터: all | campaign | review | place
async function renderReportList() {
  reports = await (await fetch('/api/reports')).json();
  renderReportRows();
}
function renderReportRows() {
  const tbody = document.getElementById('reportTableBody');
  const typeLabel = { place: '매장', campaign: '캠페인', review: '후기' };
  const targetText = r => r.targetType === 'review' ? (r.reviewTitle || '') : r.targetType === 'place' ? '-' : (r.content || '');
  const filtered = reportFilter === 'all' ? reports : reports.filter(r => (r.targetType || 'campaign') === reportFilter);
  tbody.innerHTML = filtered.map(r => `<tr>
      <td class="td-id">${r.id}</td>
      <td><span class="badge-status ${r.targetType === 'campaign' ? 'active' : 'user'}">${typeLabel[r.targetType] || r.targetType}</span></td>
      <td>${escHtml(r.placeName) || '-'}</td>
      <td>${r.targetType === 'campaign' ? (r.platform || '-') : '-'}</td>
      <td>${escHtml(targetText(r)).slice(0, 24)}</td>
      <td>${escHtml(r.reason)}</td>
      <td>${escHtml(r.detail) || '-'}</td>
      <td>${escHtml(r.reporterNickname) || '비회원'}</td>
      <td>${fmtKST(r.createdAt)}</td>
      <td>${reportActionButtons(r)}</td>
    </tr>`).join('') || `<tr><td colspan="10" class="empty-msg">신고 내역 없음</td></tr>`;
  document.getElementById('rvTotal').textContent = reports.length;
  document.getElementById('rvShown').textContent = filtered.length;
}
function filterReports(type) {
  reportFilter = type;
  document.querySelectorAll('#page-reports .subtab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('subtab-report-' + type);
  if (btn) btn.classList.add('active');
  renderReportRows();
}

// 신고 행 관리 버튼: 대상 유형별 분기 (공통: 삭제=신고기록 삭제)
function reportActionButtons(r) {
  const btns = [];
  if (r.targetType === 'campaign') {
    const c = campaigns.find(c => c.id === r.campaignId);
    if (c) {
      btns.push(`<button class="btn-edit-sm" onclick="editCampaign(${r.campaignId})">수정</button>`);
      btns.push(`<button class="btn-edit-sm" onclick="toggleCampaignHidden(${r.campaignId})">${c.hidden ? '노출' : '숨김'}</button>`);
    }
  } else if (r.targetType === 'review' && r.reviewId) {
    btns.push(`<button class="btn-edit-sm" onclick="hideReviewFromReport(${r.reviewId})">후기 숨김</button>`);
  } else if (r.targetType === 'place' && r.placeId) {
    btns.push(`<button class="btn-edit-sm" onclick="togglePlaceHidden(${r.placeId})">매장 숨김</button>`);
  }
  btns.push(`<button class="btn-del-sm" onclick="dismissReport(${r.id})">삭제</button>`);
  return btns.join('\n');
}
// 신고 목록에서 후기 숨김 (전체 노출/해제는 '후기 관리' 탭에서)
async function hideReviewFromReport(reviewId) {
  if (!confirm('이 후기를 숨길까요? (후기 관리 탭에서 다시 노출할 수 있어요)')) return;
  await fetch(`/api/places?reviews=&id=${reviewId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: true })
  });
  adminToast('후기를 숨김 처리했어요.');
}

async function toggleCampaignHidden(id) {
  const c = campaigns.find(c => c.id === id);
  if (!c) return;
  const nextHidden = !c.hidden;
  if (nextHidden && !confirm('이 캠페인을 지도에서 숨길까요? (언제든 다시 노출할 수 있어요)')) return;
  await fetch(`/api/campaigns?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: nextHidden })
  });
  c.hidden = nextHidden;
  adminToast(nextHidden ? '캠페인을 숨김 처리했어요.' : '캠페인 숨김을 해제했어요.');
  renderReportList();
}

async function dismissReport(id) {
  await fetch(`/api/reports?id=${id}`, { method: 'DELETE' });
  const idx = reports.findIndex(r => r.id === id);
  if (idx > -1) reports.splice(idx, 1);
  renderReportList();
}

// ===== 캠페인 등록 =====
function populatePlaceSelect() {
  // 매장 선택은 콤보(자동완성)로 처리하므로 별도 옵션 채움 불필요. 카테고리/플랫폼 커스텀 셀렉트만 갱신.
  refreshAdminSelects();
}

function findDuplicatePlace(name) {
  const norm = String(name || '').replace(/\s/g, '');
  if (!norm) return null;
  return places.find(p => p.name.replace(/\s/g, '') === norm) || null;
}

// 매장 선택 콤보: 키워드 입력 → 기존 등록 매장 자동완성. 미선택 시 입력값이 신규 매장명이 됨.
function onPlaceComboInput() {
  const input = document.getElementById('addName');
  const menu = document.getElementById('placeComboMenu');
  const combo = document.getElementById('placeCombo');
  // 텍스트를 직접 바꾸면 기존 매장 선택을 해제(정확히 다시 고르기 전까지 신규로 간주)
  document.getElementById('addPlaceSelect').value = '';
  const kw = input.value.trim().replace(/\s/g, '');
  if (!kw) { menu.innerHTML = ''; combo.classList.remove('open'); return; }
  // 정확일치 > 접두일치 > 부분일치 순으로 정렬 후 앞 8개. (흔한 글자로 검색해도 정확한 매장이 8개 밖으로 밀려 안 뜨던 문제 수정)
  const norm = s => (s || '').replace(/\s/g, '');
  const rank = n => n === kw ? 0 : n.startsWith(kw) ? 1 : 2;
  const matches = places.filter(p => norm(p.name).includes(kw))
    .sort((a, b) => rank(norm(a.name)) - rank(norm(b.name)) || norm(a.name).length - norm(b.name).length)
    .slice(0, 8);
  if (!matches.length) { menu.innerHTML = ''; combo.classList.remove('open'); return; }
  // 같은 이름 매장(예: '온담' 2곳)을 구분할 수 있도록 카테고리와 함께 주소도 표시
  menu.innerHTML = matches.map(p => {
    const meta = [p.category, p.address].filter(Boolean).map(escHtml).join(' · ');
    return `<div class="place-combo-item" onclick="pickExistingPlaceForNew(${p.id})"><b>${escHtml(p.name)}</b><span>${meta}</span></div>`;
  }).join('');
  combo.classList.add('open');
}

function pickExistingPlace(id) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  document.getElementById('addPlaceSelect').value = p.id;
  document.getElementById('addName').value = p.name;
  document.getElementById('addCategory').value = p.category || '';
  document.getElementById('addAddress').value = p.address || '';
  document.getElementById('addLat').value = (p.lat != null ? p.lat : '');
  document.getElementById('addLng').value = (p.lng != null ? p.lng : '');
  document.getElementById('placeCombo').classList.remove('open');
  refreshAdminSelects();
}

// 콤보에서 기존 매장을 직접 고른 경우: 매장정보 + 그 매장의 직전 캠페인 값까지 프리필(마감일 제외).
// 5일 주기로 같은 매장을 반복 등록할 때 마감일만 새로 넣으면 되도록. (editCampaign은 pickExistingPlace를
// 직접 호출하므로 프리필 대상 아님)
function pickExistingPlaceForNew(id) {
  pickExistingPlace(id);
  prefillCampaignFromLast(id);
}

// 해당 매장의 가장 최근(createdAt 기준) 캠페인 값으로 캠페인 필드를 채움. 마감일은 건드리지 않음.
function prefillCampaignFromLast(placeId) {
  if (campaignEditMode) return;
  const prev = campaigns
    .filter(c => c.placeId === placeId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  if (!prev) return;
  document.getElementById('addPlatform').value = prev.platform || '';
  ['블로그','클립','인스타그램','릴스','유튜브'].forEach(ch => {
    const el = document.getElementById(`ach_${ch}`); if (el) el.checked = (prev.channels || []).includes(ch);
  });
  document.getElementById('addContent').value = prev.content || '';
  // 협찬 링크(URL)는 캠페인마다 달라지므로 프리필하지 않고 비워 둠 — 매번 새로 입력.
  document.getElementById('addLink').value = '';
  document.getElementById('addHours').value = prev.operatingHours || '';
  document.querySelectorAll('.day-item').forEach(d => {
    d.classList.toggle('on', (prev.operatingDays || []).includes(d.textContent.trim()));
  });
  const excludeEl = document.getElementById('addExcludeHoliday');
  if (excludeEl) excludeEl.checked = prev.excludeHoliday || false;
  const noDays = !(prev.operatingDays && prev.operatingDays.length);
  const unknownEl = document.getElementById('addDaysUnknown');
  if (unknownEl) unknownEl.checked = noDays;
  document.querySelector('.day-group')?.classList.toggle('disabled', noDays);
  refreshAdminSelects();
  adminToast('직전 캠페인 값을 불러왔어요. 마감일과 협찬 링크는 새로 입력하세요.');
}

// 캠페인 수정 모드: 매장 정보(카테고리/매장선택/주소/위경도)를 읽기 전용으로 잠금
function setStoreFieldsLocked(locked) {
  document.querySelector('.reg-left')?.classList.toggle('fields-locked', locked);
  document.getElementById('storeAddrFields')?.classList.toggle('fields-locked', locked);
  const hint = document.getElementById('storeLockHint');
  if (hint) hint.style.display = locked ? 'inline' : 'none';
}

function onPlaceSelect() {
  // 콤보 구조에서는 별도 잠금 없이 자동 채움(수정 가능) — 호환용 빈 함수
  return;
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
      body: JSON.stringify({ name, address, lat, lng, category, source: 'admin' })
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

// '참여 가능 요일 확인 안됨' 체크 시: 요일 전체 해제 + 비활성(저장 시 빈 값 → 화면 미노출).
// 해제 시: 요일 선택 복원(전체 ON)
function toggleDaysUnknown(cb) {
  const group = cb.closest('.day-row')?.querySelector('.day-group');
  if (!group) return;
  if (cb.checked) {
    group.querySelectorAll('.day-item').forEach(d => d.classList.remove('on'));
    group.classList.add('disabled');
  } else {
    group.classList.remove('disabled');
    group.querySelectorAll('.day-item').forEach(d => d.classList.add('on'));
  }
}

function resetAddForm() {
  ['addName','addAddress','addContent','addLink','addHours','addLat','addLng'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('addPlaceSelect').value = '';
  document.getElementById('addPlatform').value = '';
  document.getElementById('addCategory').value = '';
  setDeadlineValue('');
  ['블로그','클립','인스타그램','릴스','유튜브'].forEach(ch => {
    const el = document.getElementById(`ach_${ch}`); if(el) el.checked = false;
  });
  document.querySelectorAll('.day-item').forEach(d => d.classList.add('on'));
  const excludeEl = document.getElementById('addExcludeHoliday'); if(excludeEl) excludeEl.checked = false;
  const unknownEl = document.getElementById('addDaysUnknown'); if(unknownEl) unknownEl.checked = false;
  document.querySelector('.day-group')?.classList.remove('disabled');
  const combo = document.getElementById('placeCombo');
  if (combo) { combo.classList.remove('open'); const m = document.getElementById('placeComboMenu'); if (m) m.innerHTML = ''; }
  setStoreFieldsLocked(false); // 신규 등록 모드에서는 매장 정보 잠금 해제
  // 수정 모드였다면 등록 모드로 복귀 (버튼/플래그 원복)
  campaignEditMode = false;
  const submitBtn = document.querySelector('.btn-submit');
  if (submitBtn) { submitBtn.textContent = '등록하기'; submitBtn.onclick = submitAdminCampaign; }
  refreshAdminSelects();
}

// ===== 커스텀 달력 (모집 마감일) =====
let dpViewYear, dpViewMonth; // 현재 보고 있는 연/월(0-based month)

function setDeadlineValue(v) {
  const input = document.getElementById('addDeadline');
  const text = document.getElementById('deadlineText');
  const trigger = document.getElementById('deadlineTrigger');
  if (!input) return;
  input.value = v || '';
  if (v) {
    text.textContent = v;
    trigger.classList.remove('placeholder');
  } else {
    text.textContent = 'YYYY-MM-DD';
    trigger.classList.add('placeholder');
  }
}

function toggleDatePicker(e) {
  if (e) e.stopPropagation();
  const wrap = document.getElementById('deadlinePicker');
  const open = wrap.classList.toggle('open');
  if (open) {
    const cur = document.getElementById('addDeadline').value;
    const base = cur ? new Date(cur) : new Date();
    dpViewYear = base.getFullYear();
    dpViewMonth = base.getMonth();
    renderDatePicker();
  }
}

function datePickerNav(delta) {
  dpViewMonth += delta;
  if (dpViewMonth < 0) { dpViewMonth = 11; dpViewYear--; }
  else if (dpViewMonth > 11) { dpViewMonth = 0; dpViewYear++; }
  renderDatePicker();
}

function renderDatePicker() {
  document.getElementById('dpYear').textContent = dpViewYear;
  document.getElementById('dpMonth').textContent = String(dpViewMonth + 1).padStart(2, '0');
  const grid = document.getElementById('dpGrid');
  const selected = document.getElementById('addDeadline').value; // 'YYYY-MM-DD'
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const firstDow = new Date(dpViewYear, dpViewMonth, 1).getDay();
  const daysInMonth = new Date(dpViewYear, dpViewMonth + 1, 0).getDate();
  const daysPrev = new Date(dpViewYear, dpViewMonth, 0).getDate();
  let html = '';
  // 이전 달 채우기
  for (let i = firstDow - 1; i >= 0; i--) {
    html += `<button type="button" class="cdate-cell muted" disabled>${daysPrev - i}</button>`;
  }
  // 이번 달
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${dpViewYear}-${String(dpViewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = ['cdate-cell'];
    if (ds === todayStr) cls.push('today');
    if (ds === selected) cls.push('selected');
    html += `<button type="button" class="${cls.join(' ')}" onclick="pickDeadline('${ds}')">${d}</button>`;
  }
  // 다음 달 채우기 (6주 = 42칸 맞춤)
  const filled = firstDow + daysInMonth;
  const trail = (7 - (filled % 7)) % 7;
  for (let i = 1; i <= trail; i++) {
    html += `<button type="button" class="cdate-cell muted" disabled>${i}</button>`;
  }
  grid.innerHTML = html;
}

function pickDeadline(ds) {
  setDeadlineValue(ds);
  document.getElementById('deadlinePicker').classList.remove('open');
}

function clearDeadline() {
  setDeadlineValue('');
  document.getElementById('deadlinePicker').classList.remove('open');
}

// 바깥 클릭 시 달력 / 매장 콤보 닫기
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('deadlinePicker');
  if (wrap && wrap.classList.contains('open') && !wrap.contains(e.target)) {
    wrap.classList.remove('open');
  }
  const combo = document.getElementById('placeCombo');
  if (combo && combo.classList.contains('open') && !combo.contains(e.target)) {
    combo.classList.remove('open');
  }
});

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
    : type === 'review'
    ? `후기 ID ${id} (${(allReviews.find(r=>r.id===id)?.title||'').slice(0,20)}...)`
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
    } else if (type === 'review') {
      await fetch(`/api/places?reviews=1&id=${id}`, { method: 'DELETE' });
      const idx = allReviews.findIndex(r => r.id === id);
      if (idx > -1) allReviews.splice(idx, 1);
      adminToast('후기 삭제 완료');
      renderReviewRows();
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
let campaignEditMode = false; // 캠페인 수정 모드 여부 (등록 탭 재진입 시 초기화 판단용)
function editCampaign(id) {
  const c = campaigns.find(c => c.id === id);
  if (!c) return;
  showTab('register');
  showSubtab('register', 'add');
  setTimeout(() => {
    pickExistingPlace(c.placeId);
    setStoreFieldsLocked(true); // 캠페인 수정 시 매장 정보는 읽기 전용
    document.getElementById('addPlatform').value = c.platform;
    (c.channels||[]).forEach(ch => {
      const el = document.getElementById(`ach_${ch}`); if(el) el.checked = true;
    });
    document.getElementById('addContent').value = c.content;
    document.getElementById('addLink').value = c.link || '';
    setDeadlineValue(c.deadline || '');
    document.getElementById('addHours').value = c.operatingHours || '';
    document.querySelectorAll('.day-item').forEach(d => {
      d.classList.toggle('on', (c.operatingDays||[]).includes(d.textContent.trim()));
    });
    const excludeEl = document.getElementById('addExcludeHoliday');
    if (excludeEl) excludeEl.checked = c.excludeHoliday || false;
    // 요일이 비어있으면 '참여 가능 요일 확인 안됨' 상태로 반영
    const noDays = !(c.operatingDays && c.operatingDays.length);
    const unknownEl = document.getElementById('addDaysUnknown');
    if (unknownEl) unknownEl.checked = noDays;
    document.querySelector('.day-group')?.classList.toggle('disabled', noDays);
    refreshAdminSelects();
    // 등록 버튼을 수정 모드로
    campaignEditMode = true;
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
  // 동적 생성된 카테고리/플랫폼 셀렉트를 커스텀 드롭다운으로 변환
  enhanceSelects(document.getElementById('previewBody'));
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
    const [name, address, category, platform, channelRaw, content, deadline, hours, daysRaw, excludeHolidayRaw, sourceUrl] = row;
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
        content: String(content), deadline: deadline ? String(deadline) : '', link: sourceUrl ? String(sourceUrl).trim() : '',
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
    ['매장명','주소','카테고리','플랫폼','채널','협찬내용','마감일','영업시간','가능요일','공휴일불가','출처URL'],
    ['스시코우지 강남','서울 강남구 테헤란로 152','음식점','레뷰','블로그,클립','오마카세 1인 체험','2026-07-31','12:00~22:00','월,화,수,목,금','Y','https://www.revu.net/campaign/123456'],
    ['카페 노티드 청담','서울 강남구 압구정로 428','카페','미블','인스타그램','음료 2잔 체험','2026-07-15','10:00~22:00','','',''],
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
    // 낙관적으로 즉시 앱 표시(로그인 화면 깜빡임 방지). 쿠키 유효성은 백그라운드로 검증.
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    let sessionValid = true;
    try { sessionValid = (await fetch('/api/places?visit=stats')).status !== 401; } catch (e) {}
    if (sessionValid) {
      await dataReady;
      initAdmin();
    } else {
      // 세션 만료 → 로그인 화면으로 되돌림(반쪽 대시보드 방지)
      document.getElementById('adminApp').style.display = 'none';
      document.getElementById('loginScreen').style.display = '';
      sessionStorage.removeItem('adminLoggedIn');
    }
  }
  // 엔터키 로그인
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin();
  });
});
