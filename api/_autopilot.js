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

const MAX_PER_RUN = 80;
const MAX_AI_CALLS = 60; // 신규매장 AI 호출 상한(초과분은 검수큐로)

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 후보명과 기존 매장명들의 bigram 겹침으로 유사한 이름 소수를 추림(AI 중복판정 입력).
function bigrams(s) { const a = []; for (let i = 0; i < s.length - 1; i++) a.push(s.slice(i, i + 2)); return a; }
function similarNames(candName, places, topN = 12) {
  const cn = norm(candName); const cbg = new Set(bigrams(cn));
  if (!cbg.size) return [];
  return places
    .map((p) => {
      const pn = norm(p.name); let hit = 0;
      for (const b of bigrams(pn)) if (cbg.has(b)) hit++;
      const contain = pn && cn && (pn.includes(cn) || cn.includes(pn)) ? 5 : 0;
      return { name: p.name, score: hit + contain };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.name);
}

async function insertPlace(db, { name, address, lat, lng, category }) {
  const r = await db.execute({
    sql: `INSERT INTO places (name, address, lat, lng, category, founder_nickname, founder_email, founder_url, founder_user_id)
          VALUES (?, ?, ?, ?, ?, '', '', '', NULL)`,
    args: [name, address, lat, lng, category],
  });
  return Number(r.lastInsertRowid);
}

async function insertCampaign(db, placeId, r, category) {
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
 * @param {object} o { db, dry }
 * @returns 요약 { processed, registered, review, skipped, remaining, dry, decisions[] }
 */
async function runAutopilot({ db, dry = false }) {
  const today = kstToday();

  // 아직 자동판정 안 한 승인 대기만(auto_seen=0). 오래된 것부터.
  const pend = await db.execute({
    sql: `SELECT * FROM scraped_items WHERE status='pending' AND COALESCE(auto_seen,0)=0 ORDER BY id ASC LIMIT ?`,
    args: [MAX_PER_RUN],
  });
  const rows = pend.rows;

  const remRes = await db.execute("SELECT COUNT(*) AS n FROM scraped_items WHERE status='pending' AND COALESCE(auto_seen,0)=0");
  const totalPending = Number(remRes.rows[0]?.n || 0);

  const placesRes = await db.execute('SELECT id, name FROM places');
  const places = placesRes.rows;

  let registered = 0, review = 0, skipped = 0, aiCalls = 0;
  const decisions = [];
  const record = (r, route, note) => decisions.push({ id: r.id, name: r.name, route, note });

  for (const r of rows) {
    const channels = csv(r.channel);

    // 🔴 마감 지남
    if (r.deadline && r.deadline < today) {
      if (!dry) await markSkipped(db, r.id, '마감 지남');
      skipped++; record(r, 'skip', '마감 지남'); continue;
    }
    // 🟡 파싱 경고 / 채널 없음 (결정론적)
    if (r.flags && String(r.flags).trim()) {
      if (!dry) await markHuman(db, r.id, '파싱경고: ' + r.flags);
      review++; record(r, 'review', '파싱경고: ' + r.flags); continue;
    }
    if (!channels.length) {
      if (!dry) await markHuman(db, r.id, '채널 없음');
      review++; record(r, 'review', '채널 없음'); continue;
    }

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
    if (aiCalls >= MAX_AI_CALLS) {
      if (!dry) await markHuman(db, r.id, '일일 AI 한도 — 다음 검수');
      review++; record(r, 'review', '일일 AI 한도'); continue;
    }
    aiCalls++;
    const verdict = await judgeCandidate({
      name: r.name, address: r.address, category: r.category, content: r.content, channel: r.channel,
      similarPlaces: similarNames(r.name, places),
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
    places.push({ id: pid, name: r.name });
    const cid = await insertCampaign(db, pid, r, verdict.category);
    await markRegistered(db, r.id, cid, `신규매장 AI승인(${verdict.confidence.toFixed(2)})`);
    registered++; record(r, 'register', `신규매장 AI승인(${verdict.confidence.toFixed(2)})`);
  }

  const remaining = Math.max(0, totalPending - rows.length);
  const note = `자동등록 ${registered} · 검수 ${review} · 스킵 ${skipped}${remaining ? ` · 남은대기 ${remaining}` : ''}${dry ? ' · [미리보기]' : ''}`;

  // 실행 이력 기록(미리보기는 남기지 않음)
  if (!dry) {
    try {
      await db.execute({
        sql: `INSERT INTO scrape_runs (platform, cursor_from, cursor_to, fetched, staged, excluded, note)
              VALUES ('autopilot', 0, 0, ?, ?, ?, ?)`,
        args: [rows.length, registered, skipped, note],
      });
    } catch (e) {}
  }

  return { processed: rows.length, registered, review, skipped, remaining, dry, note, decisions };
}

module.exports = { runAutopilot };
