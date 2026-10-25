// 인스타(@muhyeopmap) 하루 1회 자동 발행 엔진 (_ 접두 = 서버리스 함수 카운트 제외)
// 로컬 크롤러(scripts/crawl-worker.js)가 매 패스 runDailyIgPost(db)를 호출.
// 내부 가드로 KST '오늘' 1회 + TARGET_HOUR 이후에만 발행. 실데이터 기반 요일 로테이션.
//
// 흐름: 소재선정(DB) → 카피 → gpt-image-2.5 카드(무협맵_image.png 레퍼런스, 4:5 1024x1280)
//       → ig_assets 저장 → /api/banners?asset= 공개URL → IG Graph API 발행 → ig_posts 로그
//
// 필요한 env: OPENAI_API_KEY, IG_ACCESS_TOKEN(최초 시드), PUBLIC_BASE_URL(기본 https://muhyeop.com)
// 토큰은 ig_state에 저장·주기 갱신(60일 장기토큰 → 7일마다 refresh). 발행 OFF: IG_POST_ENABLED!=='1'

const fs = require('fs');
const path = require('path');

const USER_ID = '17841444037888902';           // @muhyeopmap IG user id
const IG_BASE = 'https://graph.instagram.com/v21.0';
const REF_IMG = path.join(__dirname, '..', '무협맵_image.png');
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://muhyeop.com').replace(/\/$/, '');
const TARGET_HOUR = Number(process.env.IG_POST_HOUR || 11); // KST 발행 시각(이 시각 이후 첫 패스)
const IMG_MODEL = process.env.IG_IMG_MODEL || 'gpt-image-2.5-flare';
const IMG_SIZE = '1024x1280'; // 4:5 (16배수)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kstDate = () => kstNow().toISOString().slice(0, 10);
const kstHour = () => kstNow().getUTCHours();   // +9h 적용돼 있어 getUTC* = KST
const kstDow = () => kstNow().getUTCDay();       // 0=일 … 6=토

// 활성: 숨김아님 + 매장숨김아님 + (deadline>=오늘 OR (상시 AND 45일내))
const ACTIVE = `c.hidden IS NOT 1 AND p.hidden IS NOT 1 AND (
  (c.deadline IS NOT NULL AND c.deadline <> '' AND c.deadline >= date('now','+9 hours'))
  OR ((c.deadline IS NULL OR c.deadline = '') AND c.created_at >= datetime('now','-45 days'))
)`;

// ── 상태/토큰 (ig_state) ──
async function ensureTables(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS ig_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS ig_assets (id TEXT PRIMARY KEY, mime TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS ig_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, post_date TEXT, topic TEXT, media_id TEXT, permalink TEXT, asset_id TEXT, caption TEXT, created_at TEXT DEFAULT (datetime('now')))`);
}
async function getState(db, k) { const r = await db.execute({ sql: 'SELECT v, updated_at FROM ig_state WHERE k=?', args: [k] }); return r.rows[0] || null; }
async function setState(db, k, v) { await db.execute({ sql: `INSERT INTO ig_state(k,v,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at`, args: [k, v] }); }

async function getToken(db) {
  let row = await getState(db, 'access_token');
  if (!row) {
    const envT = process.env.IG_ACCESS_TOKEN;
    if (!envT) throw new Error('IG_ACCESS_TOKEN 없음(최초 시드 필요)');
    await setState(db, 'access_token', envT);
    return envT;
  }
  const ageMs = Date.now() - (Date.parse(String(row.updated_at || '').replace(' ', 'T') + 'Z') || Date.now());
  if (ageMs > 7 * 86400e3) { // 7일마다 장기토큰 갱신(만료 방지)
    try {
      const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(row.v)}`);
      const j = await r.json();
      if (j && j.access_token) { await setState(db, 'access_token', j.access_token); return j.access_token; }
    } catch (_) {}
  }
  return row.v;
}

// ── 소재(요일 로테이션) ──
const REGIONS = [
  { label: '강남', like: '강남구' }, { label: '마포·홍대', like: '마포구' },
  { label: '송파', like: '송파구' }, { label: '성수·성동', like: '성동구' },
  { label: '수원', like: '수원시' }, { label: '분당·성남', like: '성남시' },
];
const CATES = [
  { label: '뷰티', cat: '뷰티', emoji: '💄' }, { label: '운동(헬스·필라)', cat: '운동', emoji: '🏋️' },
  { label: '헤어', cat: '헤어', emoji: '💇' }, { label: '카페', cat: '카페', emoji: '☕' },
  { label: '맛집', cat: '음식점', emoji: '🍽️' },
];
// 서비스 소개(에버그린, DB 불필요) — 목·토 슬롯에서 로테이션
const INTROS = [
  { topic: 'intro:what', headline: '무협맵이 뭐냐면? 🤔', bullets: ['여기저기 흩어진 협찬을 지도 한 곳에', '내 주변 체험단·협찬을 한눈에', '맛집·카페·뷰티·숙소까지 전부'],
    caption: '🗺️ 무협맵이 뭐냐면…\n\n블로그·인스타·유튜브에 흩어진 체험단·협찬을\n지도 한 곳에 모아주는 \'리뷰어를 위한 협찬 지도\'예요!\n\n내 주변 협찬부터 바로 찾아보세요.\n👉 프로필 링크 (@muhyeopmap)' },
  { topic: 'intro:how', headline: '무협맵 이렇게 써요 ✨', bullets: ['① 지도에서 협찬 핀을 탭', '② 협찬 내용·마감일 확인', '③ 플랫폼에서 바로 신청!'],
    caption: '✨ 무협맵 사용법, 3초면 끝!\n\n① 지도에서 핀 탭 → ② 협찬·마감일 확인 → ③ 신청\n\n복잡하게 여러 사이트 안 돌아다녀도 돼요.\n👉 프로필 링크 (@muhyeopmap)' },
  { topic: 'intro:features', headline: '무협맵 이런 기능이 🧭', bullets: ['채널별 필터 (블로그·릴스·유튜브)', '실제 방문 후기 확인', '새 협찬 직접 제보'],
    caption: '🧭 무협맵, 이런 것도 돼요\n\n· 채널별 필터(블로그·릴스·유튜브)\n· 실제 방문 후기 보고 믿고 신청\n· 새로 찾은 협찬 직접 제보\n\n👉 프로필 링크 (@muhyeopmap)' },
  { topic: 'intro:why', headline: '리뷰어에게 왜 좋냐면 💡', bullets: ['여러 플랫폼 안 돌아다녀도 OK', '내 동선 근처 협찬만 쏙', '후기 보고 믿고 신청'],
    caption: '💡 리뷰어라면 무협맵 쓰세요\n\n· 여러 플랫폼 뒤질 필요 없이 한 곳에\n· 내 동선 근처 협찬만 쏙\n· 실제 후기 보고 믿고 신청\n\n협찬 찾는 시간 확 줄여드려요.\n👉 프로필 링크 (@muhyeopmap)' },
  { topic: 'intro:platform', headline: '앱·웹·PC 어디서나 📱💻', bullets: ['iOS·안드로이드 앱', 'PC·모바일 웹 그대로', '언제 어디서나 협찬 탐색'],
    caption: '📱💻 무협맵은 어디서나!\n\n· iOS·안드로이드 앱\n· PC·모바일 웹\n\n기기 상관없이 내 주변 협찬을 지도에서 바로 찾아보세요.\n👉 앱스토어 \'무협맵\' 검색 · 프로필 링크 (@muhyeopmap)' },
  { topic: 'intro:favorite', headline: '⭐ 즐겨찾기 기능 추가!', bullets: ['관심 매장을 ⭐로 저장', '즐겨찾기만 지도로 모아보기', '마감 놓치지 않게 한눈에'],
    caption: '⭐ 새 기능! 즐겨찾기\n\n신청하고 싶은 매장을 ⭐로 저장해두면,\n즐겨찾기한 협찬만 지도·리스트로 모아볼 수 있어요.\n마감 임박도 한눈에!\n\n지금 무협맵에서 써보세요 👉 프로필 링크 (@muhyeopmap)' },
  // 블로그 꿀팁 재활용
  { topic: 'tip:hotel', headline: '호텔·펜션 무료로 가는 법? 🏨', bullets: ['숙박 체험단·협찬을 활용!', '여행지 근처 숙박 협찬 검색', '후기 쓰고 무료로 숙박'],
    caption: '🏨 호텔·펜션, 무료로 가는 법?\n\n바로 숙박 체험단·협찬이에요!\n무협맵에서 여행지 근처 숙박 협찬을 찾아,\n후기 쓰고 무료로 다녀오세요.\n\n👉 프로필 링크 (@muhyeopmap)' },
  { topic: 'tip:nearby', headline: '내 동네 무료 협찬 찾는 법 📍', bullets: ['지도에서 내 위치 기준 탐색', '동선 근처 협찬만 쏙', '맛집·카페·뷰티·숙소까지'],
    caption: '📍 내 동네 무료 협찬, 이렇게 찾아요\n\n무협맵 지도에서 내 위치 근처 협찬을 바로!\n멀리 갈 필요 없이 동선 안에서 체험단 신청하세요.\n\n👉 프로필 링크 (@muhyeopmap)' },
];

function ddayLabel(deadline) {
  if (!deadline) return '상시';
  const today = new Date(kstDate() + 'T00:00:00Z');
  const dl = new Date(String(deadline).slice(0, 10) + 'T00:00:00Z');
  const d = Math.round((dl - today) / 86400e3);
  if (d <= 0) return '오늘 마감';
  return 'D-' + d;
}
const shortName = (s) => { s = String(s || '').trim(); return s.length > 16 ? s.slice(0, 15) + '…' : s; };
function cleanRows(rows) {
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const nm = String(r.name || '').trim();
    if (!nm || nm.length < 2 || seen.has(nm)) continue;
    seen.add(nm);
    out.push({ name: nm, meta: ddayLabel(r.deadline), cat: r.category || '', region: (String(r.address || '').split(/\s+/).slice(0, 2).join(' ')) });
    if (out.length >= 4) break;
  }
  return out;
}

async function pickTopic(db) {
  const dow = kstDow();
  // 지역(월·목) / 카테고리(화·금) / 마감임박(수) / 니치·카테고리(토) / 임팩트(일)
  const total = (await db.execute(`SELECT COUNT(*) n FROM campaigns c JOIN places p ON p.id=c.place_id WHERE ${ACTIVE}`)).rows[0].n;

  if (dow === 0) { // 일 — 임팩트 숫자
    return { topic: 'impact', headline: `전국 협찬 ${Number(total).toLocaleString()}건 🔥`, kind: 'hero',
      caption: `📍 전국 협찬, 지금 ${Number(total).toLocaleString()}건 🔥\n\n블로그·인스타·유튜브… 흩어진 체험단·협찬을\n무협맵 지도 한 곳에서 한눈에!\n\n👉 프로필 링크에서 바로 시작 (@muhyeopmap)` };
  }
  if (dow === 4 || dow === 6) { // 목·토 — 서비스 소개(에버그린, 로테이션)
    const wk = Math.floor(Date.now() / (7 * 86400e3));
    const it = INTROS[(wk * 2 + (dow === 6 ? 1 : 0)) % INTROS.length];
    return { topic: it.topic, headline: it.headline, bullets: it.bullets, kind: 'intro', caption: it.caption };
  }
  if (dow === 3) { // 수 — 마감임박
    const rows = cleanRows((await db.execute(`SELECT p.name, p.address, p.category, c.deadline FROM campaigns c JOIN places p ON p.id=c.place_id
      WHERE c.hidden IS NOT 1 AND p.hidden IS NOT 1 AND c.deadline <> '' AND c.deadline >= date('now','+9 hours') AND c.deadline <= date('now','+9 hours','+2 days')
      ORDER BY c.deadline ASC, c.created_at DESC LIMIT 40`)).rows);
    if (rows.length >= 3) return { topic: 'deadline', headline: '마감임박 협찬 🚨', rows,
      caption: `🚨 곧 마감! 놓치면 다음 기회까지 기다려야 해요\n\n무협맵에서 내 주변 마감임박 협찬 확인하고 지금 신청하세요!\n\n👉 프로필 링크 (@muhyeopmap)` };
  }
  if (dow === 1) { // 월 — 지역
    const idx = Math.floor(Date.now() / 86400e3) % REGIONS.length;
    const reg = REGIONS[idx];
    const rows = cleanRows((await db.execute({ sql: `SELECT p.name, p.address, p.category, c.deadline FROM campaigns c JOIN places p ON p.id=c.place_id
      WHERE ${ACTIVE} AND p.address LIKE ? ORDER BY c.created_at DESC LIMIT 60`, args: ['%' + reg.like + '%'] })).rows);
    if (rows.length >= 3) return { topic: 'region:' + reg.label, headline: `${reg.label} 신규 협찬 🔥`, rows,
      caption: `📍 ${reg.label} 신규 협찬 모아봤어요!\n\n내 주변 협찬·체험단을 지도에서 한눈에.\n맛집·카페·뷰티·헤어까지 전부 무협맵에서!\n\n👉 프로필 링크 (@muhyeopmap)` };
  }
  // 화·금 — 카테고리 (+ 수/월 소재부족 시 폴백)
  const cidx = Math.floor(Date.now() / 86400e3) % CATES.length;
  const cte = CATES[cidx];
  const rows = cleanRows((await db.execute({ sql: `SELECT p.name, p.address, p.category, c.deadline FROM campaigns c JOIN places p ON p.id=c.place_id
    WHERE ${ACTIVE} AND p.category = ? ORDER BY c.created_at DESC LIMIT 60`, args: [cte.cat] })).rows);
  if (rows.length >= 3) return { topic: 'category:' + cte.label, headline: `이번주 ${cte.label} 협찬 ${cte.emoji}`, rows,
    caption: `${cte.emoji} ${cte.label} 협찬 찾고 계셨나요?\n\n무협맵에 지금 모집 중인 ${cte.label} 협찬 가득!\n내 주변부터 지도에서 한눈에 확인하세요.\n\n👉 프로필 링크 (@muhyeopmap)` };

  return null; // 소재 부족 → 이번날 스킵
}

const HASHTAGS = '\n\n#무협맵 #협찬 #체험단 #체험단모집 #블로그체험단 #리뷰어 #인플루언서 #맛집협찬 #뷰티협찬 #협찬찾기 #무료체험단 #체험단일상 #인스타협찬';

// 캐릭터 동적 포즈 풀 — 매번 서있는 정적 포즈 방지(무협 검객답게 역동적으로). 날짜별 로테이션.
const POSES = [
  'DASHING/running energetically toward the viewer, clothes and sash flowing, bold motion/speed lines',
  'LEAPING high in the air mid-jump with an excited grin, dynamic action pose, motion lines',
  'in a dynamic ninja ready-to-sprint crouch, determined look, about to dash off',
  'striking a heroic action pose while whipping out his pin-tipped sword, speed lines, low dramatic angle',
  'running side-by-side with the shiba dog, both in full motion and excited, motion lines',
  'pointing forward dynamically from a low heroic camera angle, wind and motion lines around him',
  'sliding/landing with a triumphant fist-pump, dust and speed lines, energetic',
];
const pickPose = () => POSES[Math.floor(Date.now() / 86400e3) % POSES.length];

// ── 이미지 생성 ──
function buildPrompt(t) {
  const pose = pickPose();
  const pre = `Reference image is the official character design sheet for "무협맵" (Muhyeop Map). Use the EXACT same characters — the red-and-black little swordsman boy (pin-shaped 삿갓 hat, black hanbok with red trim, black hair, same face) and the orange shiba dog with pin hat and map-pin necklace. Keep their faces, proportions, outfit and art style IDENTICAL to the reference. Ignore the sheet's labels/swatches/multi-view layout — create ONE brand-new single illustration.

Design a VERTICAL 4:5 PORTRAIT Instagram card (taller than wide), brand colors red (#E53935) and white, clean modern flat style, mobile-friendly, crisp PERFECTLY-LEGIBLE Korean text. Full vertical hierarchy with clean padding at top/bottom edges.
IMPORTANT — make it feel ENERGETIC and DYNAMIC: the swordsman character strikes a lively ACTION pose (NOT a stiff standing/pointing pose), with a clear sense of movement, motion/speed lines, and lively composition.`;
  const foot = `\nBottom ribbon/banner: white map-pin logo + Korean caption "내 주변 협찬, 무협맵에서 한눈에". The swordsman boy appears ${pose}; the shiba dog nearby, also lively. Subtle map / location-pin motif in the background. All Korean text spelled EXACTLY as given.`;
  if (t.kind === 'hero') {
    return `${pre}
Center a HUGE bold hero text: "${t.headline}" as the focal point, with a small label above it "전국 협찬 지금". Headline below (Korean): "흩어진 협찬, 무협맵 지도 한 곳에".${foot}`;
  }
  if (t.kind === 'intro') {
    const bl = t.bullets.map((b, i) => `${i + 1}. "${b}"`).join('\n');
    return `${pre}
Top headline (Korean, bold, large): "${t.headline}"
Below it, a clean vertical list of ${t.bullets.length} short Korean benefit lines, each with a small red check or map-pin bullet icon:
${bl}
The swordsman boy is prominent and ENERGETIC (${pose}); the shiba dog nearby, lively. Keep every Korean line spelled EXACTLY as written and clearly legible.${foot}`;
  }
  const list = t.rows.map((r, i) => `${i + 1}. "${r.name}" with a red pill "${r.meta}"`).join('\n');
  return `${pre}
Top headline (Korean, bold): "${t.headline}"
A vertical list of ${t.rows.length} rounded white cards, each row: store name (Korean, left) and a red rounded pill on the right:
${list}
Keep every Korean store name spelled exactly as written and clearly legible.${foot}`;
}

// 레퍼런스 이미지: 로컬(크롤러)은 파일, 서버(Vercel 함수)는 파일이 없으니 호스팅 URL(ig_assets 'ref-char')로 폴백
async function loadRefBuf() {
  try { return fs.readFileSync(REF_IMG); } catch (_) {}
  const res = await fetch(`${PUBLIC_BASE}/api/banners?asset=ref-char`);
  if (!res.ok) throw new Error('ref image load fail ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function genImage(prompt) {
  const buf = await loadRefBuf();
  const fd = new FormData();
  fd.append('model', IMG_MODEL);
  fd.append('prompt', prompt);
  fd.append('size', IMG_SIZE);
  fd.append('image[]', new Blob([buf], { type: 'image/png' }), 'ref.png');
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: fd });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error('image gen: ' + JSON.stringify(j.error || j).slice(0, 200));
  const b64 = j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) throw new Error('image gen: no data');
  return b64;
}

// ── IG 발행 ──
async function publish(token, imageUrl, caption) {
  let res = await fetch(`${IG_BASE}/${USER_ID}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }) });
  let j = await res.json();
  if (!res.ok || j.error) throw new Error('container: ' + JSON.stringify(j.error || j).slice(0, 200));
  const cid = j.id;
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    const s = await (await fetch(`${IG_BASE}/${cid}?fields=status_code&access_token=${encodeURIComponent(token)}`)).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('container ERROR');
  }
  res = await fetch(`${IG_BASE}/${USER_ID}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: cid, access_token: token }) });
  j = await res.json();
  if (!res.ok || j.error) throw new Error('publish: ' + JSON.stringify(j.error || j).slice(0, 200));
  const mediaId = j.id;
  let permalink = '';
  try { const p = await (await fetch(`${IG_BASE}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`)).json(); permalink = p.permalink || ''; } catch (_) {}
  return { mediaId, permalink };
}

// ── 메인: 하루 1회 발행 ──
async function runDailyIgPost(db) {
  if (process.env.IG_POST_ENABLED !== '1') return { skipped: 'disabled' };
  if (!process.env.OPENAI_API_KEY) return { skipped: 'no-openai' };
  if (kstHour() < TARGET_HOUR) return { skipped: 'before-hour' };
  await ensureTables(db);
  const today = kstDate();
  const last = await getState(db, 'last_post_date');
  if (last && last.v === today) return { skipped: 'already-today' };
  // 중복발행 레이스 방지: 먼저 날짜 선점(실패 시 롤백 안 해도 다음날 재개)
  await setState(db, 'last_post_date', today);

  const token = await getToken(db);
  const t = await pickTopic(db);
  if (!t) { return { skipped: 'no-material' }; }

  const prompt = buildPrompt(t);
  const b64 = await genImage(prompt);
  const assetId = 'post-' + today.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7);
  await db.execute({ sql: `INSERT OR REPLACE INTO ig_assets (id, mime, data) VALUES (?, 'image/png', ?)`, args: [assetId, b64] });
  const imageUrl = `${PUBLIC_BASE}/api/banners?asset=${assetId}`;

  const caption = (t.caption || '') + HASHTAGS;
  const { mediaId, permalink } = await publish(token, imageUrl, caption);
  await db.execute({ sql: `INSERT INTO ig_posts (post_date, topic, media_id, permalink, asset_id, caption) VALUES (?,?,?,?,?,?)`, args: [today, t.topic, mediaId, permalink, assetId, caption] });
  let thread = null;
  try { thread = await require('./_igthread').crossPost(db, caption, imageUrl); } catch (e) { thread = { error: String(e.message || e) }; }
  return { posted: true, topic: t.topic, permalink, mediaId, thread };
}

module.exports = { runDailyIgPost, ensureTables, pickTopic, buildPrompt };
