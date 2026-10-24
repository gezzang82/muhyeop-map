// 인스타 웹툰 캐러셀 자동 발행 엔진 (_ 접두 = 함수 카운트 제외)
// 블로그 「오늘도 협찬 뛴다」 ③~⑥화를 N일 간격으로 IG 캐러셀 재발행.
// 재가공 = gpt-image-2.5 아웃페인팅(원본 유지 + 4:5 확장, 브라우저 불필요 = 크롤러에서 실행 OK).
// 흐름: 블로그 글 HTML → episode-N 이미지 URL 추출 → 다운로드 → 아웃페인팅(1024x1280) →
//       ig_assets 저장 → 캐러셀 발행 → ig_posts 로그 → webtoon_next++ / 날짜 갱신.
// 가드: IG_POST_ENABLED=1 + KST TARGET_HOUR 이후 + 마지막 웹툰 후 WEBTOON_EVERY_DAYS일 경과.

const USER_ID = '17841444037888902';
const IG = 'https://graph.instagram.com/v21.0';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://muhyeop.com').replace(/\/$/, '');
const TARGET_HOUR = Number(process.env.IG_POST_HOUR || 11);
const EVERY_DAYS = Number(process.env.WEBTOON_EVERY_DAYS || 2);
const IMG_MODEL = process.env.IG_IMG_MODEL || 'gpt-image-2.5-flare';

// ①②화는 이미 IG에 있음 → ③화부터. (blog.naver.com/muhyeopmap logNo)
const EPISODES = {
  3: { logNo: '224408683472', sub: '마감 놓침.. 마감임박순으로 딱!' },
  4: { logNo: '224410217905', sub: '낯선 동네 협찬, 지도로 먼저 찾는다' },
  5: { logNo: '224412995618', sub: '정성껏 쓴 협찬 후기, 묻히긴 아깝잖아' },
  6: { logNo: '224417294287', sub: '여행 전에, 호텔 근처 협찬 미리 찜!' },
};
const HASHTAGS = '\n\n#무협맵 #무협맵웹툰 #협찬 #체험단 #체험단모집 #블로그체험단 #리뷰어 #인플루언서 #체험단웹툰 #협찬찾기 #무료체험단 #체험단일상 #웹툰 #일상툰';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kstNow = () => new Date(Date.now() + 9 * 3600e3);
const kstDate = () => kstNow().toISOString().slice(0, 10);
const kstHour = () => kstNow().getUTCHours();
const daysBetween = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400e3);

async function ensureTables(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS ig_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS ig_assets (id TEXT PRIMARY KEY, mime TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS ig_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, post_date TEXT, topic TEXT, media_id TEXT, permalink TEXT, asset_id TEXT, caption TEXT, created_at TEXT DEFAULT (datetime('now')))`);
}
async function getState(db, k) { const r = await db.execute({ sql: 'SELECT v FROM ig_state WHERE k=?', args: [k] }); return r.rows[0] ? r.rows[0].v : null; }
async function setState(db, k, v) { await db.execute({ sql: `INSERT INTO ig_state(k,v,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at`, args: [k, String(v)] }); }

// 블로그 글에서 episode-N-cover / panel 이미지 URL 추출(순서대로)
async function episodeImageUrls(logNo, n) {
  const html = await (await fetch(`https://blog.naver.com/PostView.naver?blogId=muhyeopmap&logNo=${logNo}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const grab = (re) => { const m = html.match(re); return m ? m[0] : null; };
  const cover = grab(new RegExp(`https://postfiles\\.pstatic\\.net/[^"']*episode-${n}(?:-v\\d+)?-cover\\.png`));
  const panels = [];
  for (let i = 1; i <= 8; i++) {
    const p = grab(new RegExp(`https://postfiles\\.pstatic\\.net/[^"']*episode-${n}(?:-v\\d+)?-panel-0${i}\\.png`));
    if (p) panels.push(p);
  }
  const urls = [];
  if (cover) urls.push(cover);
  urls.push(...panels);
  return urls;
}

async function downloadPng(url) {
  const res = await fetch(url + '?type=w966', { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://blog.naver.com/' } });
  if (!res.ok) throw new Error('download ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

// 원본 버퍼: 서버에 미리 담아둔 것(ig_assets 'wtsrc-N-*') 우선, 없으면 네이버 블로그 실시간 폴백
async function getSourceBuffers(db, n, logNo) {
  const rows = (await db.execute({ sql: "SELECT data FROM ig_assets WHERE id LIKE ? ORDER BY id", args: [`wtsrc-${n}-%`] })).rows;
  if (rows.length >= 2) return rows.map(r => Buffer.from(r.data, 'base64'));
  const urls = await episodeImageUrls(logNo, n);
  const bufs = [];
  for (const u of urls) bufs.push(await downloadPng(u));
  return bufs;
}

async function outpaint(buf) {
  const prompt = `The attached image is a finished Korean webtoon panel.
Produce a 1024:1280 VERTICAL image where this EXACT panel is fully visible, UNCHANGED and UNCROPPED, centered.
Then NATURALLY EXTEND / OUTPAINT the artwork to fill the remaining space to reach the 4:5 frame — continue the SAME drawing style, line art, colors, lighting and background scene so the extension is seamless.
Do NOT redraw, restyle, distort, crop or move the original panel. Do NOT alter any existing characters or the Korean speech-bubble text. Only generate the newly added surrounding area as a believable continuation.`;
  const fd = new FormData();
  fd.append('model', IMG_MODEL);
  fd.append('prompt', prompt);
  fd.append('size', '1024x1280');
  fd.append('image[]', new Blob([buf], { type: 'image/png' }), 'panel.png');
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: fd });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error('outpaint: ' + JSON.stringify(j.error || j).slice(0, 160));
  const b64 = j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) throw new Error('outpaint: no data');
  return b64;
}

async function publishCarousel(db, token, assetIds, caption) {
  const children = [];
  for (const id of assetIds) {
    const res = await fetch(`${IG}/${USER_ID}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ image_url: `${PUBLIC_BASE}/api/banners?asset=${id}`, is_carousel_item: 'true', access_token: token }) });
    const j = await res.json();
    if (!res.ok || j.error) throw new Error('child: ' + JSON.stringify(j.error || j).slice(0, 160));
    children.push(j.id);
  }
  let res = await fetch(`${IG}/${USER_ID}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token }) });
  let j = await res.json();
  if (!res.ok || j.error) throw new Error('carousel: ' + JSON.stringify(j.error || j).slice(0, 160));
  const cid = j.id;
  for (let i = 0; i < 12; i++) { await sleep(2500); const s = await (await fetch(`${IG}/${cid}?fields=status_code&access_token=${encodeURIComponent(token)}`)).json(); if (s.status_code === 'FINISHED') break; if (s.status_code === 'ERROR') throw new Error('container ERROR'); }
  res = await fetch(`${IG}/${USER_ID}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: cid, access_token: token }) });
  j = await res.json();
  if (!res.ok || j.error) throw new Error('publish: ' + JSON.stringify(j.error || j).slice(0, 160));
  let permalink = '';
  try { permalink = (await (await fetch(`${IG}/${j.id}?fields=permalink&access_token=${encodeURIComponent(token)}`)).json()).permalink || ''; } catch (_) {}
  return { mediaId: j.id, permalink };
}

// 토큰은 _igpost와 동일하게 ig_state에 저장된 것 재사용(없으면 env 시드)
async function getToken(db) {
  let v = await getState(db, 'access_token');
  if (!v) { v = process.env.IG_ACCESS_TOKEN; if (!v) throw new Error('no token'); await setState(db, 'access_token', v); }
  return v;
}

async function runWebtoonPost(db) {
  if (process.env.IG_POST_ENABLED !== '1') return { skipped: 'disabled' };
  if (!process.env.OPENAI_API_KEY) return { skipped: 'no-openai' };
  if (kstHour() < TARGET_HOUR) return { skipped: 'before-hour' };
  await ensureTables(db);
  const next = Number(await getState(db, 'webtoon_next') || 3);
  if (!EPISODES[next]) return { skipped: 'all-done' };
  const today = kstDate();
  const last = await getState(db, 'webtoon_last_date');
  if (last && daysBetween(today, last) < EVERY_DAYS) return { skipped: 'not-due' };
  // 하루 1포스트 유지: 오늘 이미 뭔가 올렸으면 스킵(카드/웹툰 공용 가드)
  if ((await getState(db, 'last_post_date')) === today) return { skipped: 'posted-today' };

  const ep = EPISODES[next];
  const srcBufs = await getSourceBuffers(db, next, ep.logNo);
  if (srcBufs.length < 2) return { skipped: 'no-images', ep: next };

  // 날짜 선점(중복발행 방지) — 실패 시 webtoon_next는 안 올려 다음 사이클 재시도
  await setState(db, 'last_post_date', today);
  await setState(db, 'webtoon_last_date', today);

  const assetIds = [];
  for (let i = 0; i < srcBufs.length; i++) {
    const b64 = await outpaint(srcBufs[i]);
    const id = `wt-${next}-${i}-${today.replace(/-/g, '')}`;
    await db.execute({ sql: `INSERT OR REPLACE INTO ig_assets (id, mime, data) VALUES (?, 'image/png', ?)`, args: [id, b64] });
    assetIds.push(id);
  }
  const caption = `[무협맵 웹툰] 오늘도 협찬 뛴다 ${['','①','②','③','④','⑤','⑥'][next]}화\n${ep.sub}\n\n흩어진 체험단·협찬, 이제 무협맵 지도 한 곳에서 한눈에! 🗺️\n👉 프로필 링크 (@muhyeopmap) · 앱스토어 '무협맵' 검색` + HASHTAGS;

  const token = await getToken(db);
  const { mediaId, permalink } = await publishCarousel(db, token, assetIds, caption);
  await db.execute({ sql: `INSERT INTO ig_posts (post_date, topic, media_id, permalink, asset_id, caption) VALUES (?,?,?,?,?,?)`, args: [today, 'webtoon:' + next, mediaId, permalink, assetIds[0], caption] });
  await setState(db, 'webtoon_next', next + 1);
  return { posted: true, episode: next, permalink, slides: assetIds.length };
}

module.exports = { runWebtoonPost };
