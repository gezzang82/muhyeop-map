/**
 * 오토파일럿: 수집된 승인 대기(scraped_items)를 매일 자동 검수·등록한다.
 *
 * 라우팅 3갈래 (보수적 — 조금이라도 애매하면 사람에게):
 *   🟢 자동등록  → places/campaigns INSERT(campaigns.source='ai'), scraped_items status='registered'
 *   🟡 검수대기  → scraped_items auto_seen=1 (status는 pending 유지), auto_note=사유. 운영자가 기존 UI에서 처리
 *   🔴 스킵      → scraped_items status='rejected', auto_note=사유 (마감 지남 등)
 *
 * 대부분은 결정론적 규칙(_scrape.js가 매긴 dedupe_status/flags)으로 라우팅하고,
 * AI(judgeCandidate)는 신규매장 후보(new_place)에만 호출 — 카테고리·내용 정합 + fuzzy 중복.
 * 기존매장 추가/갱신(add_channel/renew)은 좌표 불필요·flags 없으면 규칙만으로 자동등록.
 *
 * dry=true면 라우팅·지오코딩·AI 판정까지 실제로 하되 DB 쓰기는 하지 않고 결정 목록만 반환(미리보기).
 * 한 번 실행에 MAX_PER_RUN건까지만 처리(백로그가 커도 타임아웃/비용 폭주 방지). 나머지는 다음 실행에서.
 *
 * 새 api 파일 아님(_ 접두사 = Vercel 함수 카운트 제외).
 */

const { geocodeServer } = require('./_geocode');
const { judgeCandidate } = require('./_ai');

const MAX_PER_RUN = 300; // 한 실행 처리 상한(실질 상한은 시간 예산 deadlineTs)
const MAX_AI_CALLS = 800; // 신규매장 AI 호출 상한(비용 안전판; gpt-4o-mini라 매우 저렴해 넉넉히)

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 대략 거리(m). 서울 위도(~37.5)에서 경도 1도≈88km.
function distM(lat1, lng1, lat2, lng2) {
  const dLat = (lat1 - lat2) * 111000;
  const dLng = (lng1 - lng2) * 88000;
  return Math.hypot(dLat, dLng);
}
// 후보와 '가까운 위치'의 유사 이름 매장만 추림(AI 중복판정 입력).
// 이름 토큰만 겹치는 먼 매장(프랜차이즈 다른 지점·우연한 겹침)은 제외 → 중복 오탐 제거.
function bigrams(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
function similarNearby(candName, coords, places, radiusM = 300, topN = 8) {
  const cn = norm(candName); const cbg = new Set(bigrams(cn));
  if (!cbg.size || !coords) return [];
  return places
    .map((p) => {
      if (p.lat == null || p.lng == null) return null;
      const d = distM(coords.lat, coords.lng, Number(p.lat), Number(p.lng));
      if (d > radiusM) return null; // 반경 밖은 다른 매장으로 간주(같은 브랜드 다른 지점 포함)
      const pn = norm(p.name); let hit = 0;
      for (const b of bigrams(pn)) if (cbg.has(b)) hit++;
      const contain = pn && cn && (pn.includes(cn) || cn.includes(pn)) ? 5 : 0;
      const score = hit + contain;
      return score > 0 ? { name: p.name, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.name);
}

async function insertPlace(db, { name, address, lat, lng, category }) {
  // 같은 이름+좌표 매장이 있으면 재사용(중복 매장 방지 — 한 매장에 채널별 캠페인이 붙게).
  // 좌표 인덱스(idx_places_lat_lng)로 근처 매장만 읽고 이름은 앱에서 비교 — REPLACE()가 인덱스를 막아
  // 매 등록마다 places 전체(2만행)를 스캔하던 것을 근처 몇 행만 읽도록.
  const nkey = String(name).replace(/ /g, '');
  const near = await db.execute({
    sql: 'SELECT id, name FROM places WHERE lat > ? AND lat < ? AND lng > ? AND lng < ?',
    args: [Number(lat) - 0.0007, Number(lat) + 0.0007, Number(lng) - 0.0007, Number(lng) + 0.0007],
  });
  const hit = near.rows.find((p) => String(p.name).replace(/ /g, '') === nkey);
  if (hit) return Number(hit.id);
  const r = await db.execute({
    sql: `INSERT INTO places (name, address, lat, lng, category, founder_nickname, founder_email, founder_url, founder_user_id)
          VALUES (?, ?, ?, ?, ?, '', '', '', NULL)`,
    args: [name, address, lat, lng, category],
  });
  return Number(r.lastInsertRowid);
}

async function insertCampaign(db, placeId, r, category) {
  const link = r.source_url || '';
  // 같은 링크(플랫폼 캠페인 URL은 고유) 캠페인이 이미 있으면 재생성 안 함
  // — 서버/로컬 오토파일럿이 동시에 같은 항목을 처리해 캠페인이 2개 생기던 중복 방지.
  if (link) {
    const dup = await db.execute({ sql: 'SELECT id FROM campaigns WHERE link = ? LIMIT 1', args: [link] });
    if (dup.rows.length) return Number(dup.rows[0].id);
  }
  const channels = JSON.stringify(csv(r.channel));
  const operatingDays = JSON.stringify(csv(r.days));
  const res = await db.execute({
    sql: `INSERT INTO campaigns (place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', 'ai', NULL)`,
    args: [placeId, r.platform || '디너의여왕', channels, r.content || '', r.deadline || '',
      r.source_url || '', operatingDays, r.hours || '', r.exclude_holiday ? 1 : 0],
  });
  return Number(res.lastInsertRowid);
}

async function markRegistered(db, id, campaignId, note) {
  await db.execute({
    sql: `UPDATE scraped_items SET status='registered', created_campaign_id=?, auto_seen=1, auto_note=?, reviewed_at=datetime('now','+9 hours') WHERE id=?`,
    args: [campaignId, note || '', id],
  });
}
async function markHuman(db, id, note) {
  await db.execute({ sql: `UPDATE scraped_items SET auto_seen=1, auto_note=? WHERE id=?`, args: [note || '', id] });
}
async function markSkipped(db, id, note) {
  await db.execute({
    sql: `UPDATE scraped_items SET status='rejected', auto_seen=1, auto_note=?, reviewed_at=datetime('now','+9 hours') WHERE id=?`,
    args: [note || '', id],
  });
}

/**
 * @param {object} o { db, dry, deadlineTs }
 * @returns 요약 { processed, registered, review, skipped, remaining, dry, decisions[] }
 */
async function runAutopilot({ db, dry = false, deadlineTs = 0, places: _places = null }) {
  const today = kstToday();

  // 아직 자동판정 안 한 승인 대기만(auto_seen=0). 오래된 것부터.
  // auto_seen은 NULL 없이 0/1이라 COALESCE 불필요 → idx_scraped_status_seen(status,auto_seen) 인덱스로
  // 전체 3.3만 스캔 대신 대상(pending&seen=0)만 읽음.
  const pend = await db.execute({
    sql: `SELECT * FROM scraped_items WHERE status='pending' AND auto_seen=0 ORDER BY id ASC LIMIT ?`,
    args: [MAX_PER_RUN],
  });
  const rows = pend.rows;

  const remRes = await db.execute("SELECT COUNT(*) AS n FROM scraped_items WHERE status='pending' AND auto_seen=0");
  const totalPending = Number(remRes.rows[0]?.n || 0);

  // 매장 목록(중복확인용). crawl-worker가 패스당 1번 읽어 넘겨주면 재사용(autopilot 호출마다 2만행 재읽기 방지).
  // 넘겨받은 배열엔 이 실행에서 새로 만든 매장을 push해 같은 패스 내 뒤 호출도 최신으로 봄.
  const places = _places || (await db.execute('SELECT id, name, lat, lng FROM places')).rows;
  // 자동등록을 막는(=검수로 보내는) '차단성' 경고만 남김. 요일·카테고리 불확실은 차단 안 함:
  //  - 요일 불확실 → 요일 비워서 등록(공개화면 요일 미노출)
  //  - 카테고리 불확실 → 신규매장은 AI가 카테고리 판단, 기존매장은 기존 값 유지
  // (채널 없음은 아래 별도 처리, 실제 등록 불가라 검수)
  const dayFlagRe = /가능요일확인|요일·공휴일 재확인\([^)]*\)|요일·공휴일 재확인/g;
  const catFlagRe = /카테고리확인(?:\([^)]*\))?/g;
  const residualFlags = (f) => String(f || '').replace(dayFlagRe, '').replace(catFlagRe, '').replace(/\s+/g, ' ').trim();

  let registered = 0, review = 0, skipped = 0, aiCalls = 0, processed = 0, timedOut = false;
  const decisions = [];
  const record = (r, route, note) => decisions.push({ id: r.id, name: r.name, route, note });

  for (const r of rows) {
    // 시간 예산 초과 시 중단 — 못한 대기건은 auto_seen=0로 남아 다음 실행에서 이어받음.
    if (deadlineTs && Date.now() > deadlineTs) { timedOut = true; break; }
    processed++;
    const channels = csv(r.channel);

    // 🔴 마감 지남
    if (r.deadline && r.deadline < today) {
      if (!dry) await markSkipped(db, r.id, '마감 지남');
      skipped++; record(r, 'skip', '마감 지남'); continue;
    }
    // 🟡 채널 없음 = 등록 불가 → 검수
    if (!channels.length) {
      if (!dry) await markHuman(db, r.id, '채널 없음');
      review++; record(r, 'review', '채널 없음'); continue;
    }
    // 요일·카테고리 외의 파싱 경고가 남아있으면 검수. (요일/카테고리 불확실은 아래에서 자체 처리)
    const resid = residualFlags(r.flags);
    if (resid) {
      if (!dry) await markHuman(db, r.id, '파싱경고: ' + resid);
      review++; record(r, 'review', '파싱경고: ' + resid); continue;
    }
    // 요일이 불확실하면(=요일 관련 플래그 존재) 요일을 비워서 등록(공개화면 요일 미노출).
    if (/가능요일확인|요일·공휴일 재확인/.test(String(r.flags || ''))) r.days = '';

    const status = r.dedupe_status;
    // 🟢 기존매장 추가/갱신: 매장 있으니 좌표·AI 불필요, 규칙만으로 자동등록
    if (r.matched_place_id && (status === 'add_channel' || status === 'renew')) {
      if (dry) { registered++; record(r, 'register', `기존매장(${status})`); continue; }
      const cid = await insertCampaign(db, r.matched_place_id, r, r.category || '기타');
      await markRegistered(db, r.id, cid, `기존매장(${status})`);
      registered++; record(r, 'register', `기존매장(${status})`); continue;
    }

    // 신규매장 후보 → 서버 지오코딩 + AI 판정
    const coords = await geocodeServer({ name: r.name, address: r.address });
    if (!coords) {
      if (!dry) await markHuman(db, r.id, '좌표변환 실패');
      review++; record(r, 'review', '좌표변환 실패'); continue;
    }
    // 좌표 확보 후: 같은 이름 + 가까운 위치(100m)의 매장이 이미 있으면 그 매장에 캠페인 추가(기존매장 취급)로 자동등록.
    // 스크래핑 classify 이후 등록된 매장을 AI가 '중복의심'으로 검수 보내던 것 → 자동등록으로 전환(AI 호출도 아낌).
    const cn = norm(r.name);
    const existing = places.find((p) => p.lat != null && norm(p.name) === cn && distM(coords.lat, coords.lng, Number(p.lat), Number(p.lng)) < 100);
    if (existing) {
      if (dry) { registered++; record(r, 'register', '기존매장(동일명·근접)'); continue; }
      const cid = await insertCampaign(db, existing.id, r, r.category || '기타');
      await markRegistered(db, r.id, cid, '기존매장(동일명·근접)');
      registered++; record(r, 'register', '기존매장(동일명·근접)'); continue;
    }
    if (aiCalls >= MAX_AI_CALLS) {
      if (!dry) await markHuman(db, r.id, '일일 AI 한도 — 다음 검수');
      review++; record(r, 'review', '일일 AI 한도'); continue;
    }
    aiCalls++;
    const verdict = await judgeCandidate({
      name: r.name, address: r.address, category: r.category, content: r.content, channel: r.channel,
      similarPlaces: similarNearby(r.name, coords, places),
    });
    if (!verdict.approve) {
      const note = verdict.duplicateOf
        ? `중복의심: ${verdict.duplicateOf}`
        : `AI보류(${verdict.confidence.toFixed(2)}): ${verdict.reason}`;
      if (!dry) await markHuman(db, r.id, note);
      review++; record(r, 'review', note); continue;
    }
    // 🟢 자동등록: 신규 매장 생성 + 캠페인
    if (dry) { registered++; record(r, 'register', `신규매장 AI승인(${verdict.confidence.toFixed(2)})`); continue; }
    const pid = await insertPlace(db, {
      name: r.name, address: r.address, lat: coords.lat, lng: coords.lng, category: verdict.category,
    });
    places.push({ id: pid, name: r.name, lat: coords.lat, lng: coords.lng });
    const cid = await insertCampaign(db, pid, r, verdict.category);
    await markRegistered(db, r.id, cid, `신규매장 AI승인(${verdict.confidence.toFixed(2)})`);
    registered++; record(r, 'register', `신규매장 AI승인(${verdict.confidence.toFixed(2)})`);
  }

  const remaining = Math.max(0, totalPending - processed);
  const note = `자동등록 ${registered} · 검수 ${review} · 스킵 ${skipped}${remaining ? ` · 남은대기 ${remaining}` : ''}${timedOut ? ' · 시간초과중단' : ''}${dry ? ' · [미리보기]' : ''}`;

  // 실행 이력 기록(미리보기는 남기지 않음)
  if (!dry) {
    try {
      await db.execute({
        sql: `INSERT INTO scrape_runs (platform, cursor_from, cursor_to, fetched, staged, excluded, note)
              VALUES ('autopilot', 0, 0, ?, ?, ?, ?)`,
        args: [processed, registered, skipped, note],
      });
    } catch (e) {}
  }

  return { processed, registered, review, skipped, remaining, dry, timedOut, note, decisions };
}

module.exports = { runAutopilot };
