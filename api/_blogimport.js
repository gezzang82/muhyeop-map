// api/_blogimport.js — 블로그 글 → 후기 자동매칭 엔진 (RSS 수집 + AI 매장/지역 추출 + places 매칭).
//  '_' 접두=함수 카운트 제외. docs/product/20 스펙. places.js `?blogimport=` 분기가 호출.
//  검증: PoC(match-poc.cjs)에서 체험단 블로거 15글 → 14/14 매칭, 게이트가 오매칭('하루') 🟡로 차단.
const norm = s => String(s || '').replace(/\s/g, '').toLowerCase();

// 네이버 블로그 공개 RSS로 최근 글 목록(제목·링크·날짜·요약). 권한/스코프 불필요.
//  limit=50: UI 안내("최근 50개까지")와 일치. RSS 자체가 최근 ~50개만 노출 → 그보다 과거 글은 불러오기 불가(수동 등록).
async function fetchBlogPosts(blogId, limit = 50) {
  let xml = '';
  try {
    const r = await fetch(`https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`);
    if (!r.ok) return [];
    xml = await r.text();
  } catch (e) { return []; }
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  const pick = (b, t) => { const r = new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`).exec(b); return r ? r[1].trim() : ''; };
  return items.slice(0, limit).map(b => ({
    title: pick(b, 'title'),
    link: pick(b, 'link').split('?')[0],
    date: pick(b, 'pubDate').slice(5, 16),
    desc: pick(b, 'description').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 120),
  })).filter(p => p.title && p.link);
}

// 네이버 블로그 글목록 API(PostTitleListAsync) — 한 페이지(≤30개) 글(제목·logNo·작성일). 요약 없음(제목만).
//  제목에 매장명이 들어가는 체험단 특성상 제목만으로 매칭 가능. 반환: {posts, isLast}(isLast=마지막 페이지/더 없음).
async function fetchBlogPage(blogId, page) {
  const decTitle = (t) => { try { return decodeURIComponent(String(t).replace(/\+/g, ' ')).trim(); } catch (e) { return String(t).replace(/\+/g, ' ').trim(); } };
  let text = '';
  try {
    const r = await fetch(`https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=${page}&countPerPage=30&categoryNo=0`, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: `https://blog.naver.com/${blogId}` } });
    if (!r.ok) return { posts: [], isLast: true };
    text = await r.text();  // ⚠️ JSON.parse 금지: 응답에 깨진 이스케이프 있어 던짐 → 정규식 추출
  } catch (e) { return { posts: [], isLast: true }; }
  const matches = [...text.matchAll(/"logNo":"(\d+)"[\s\S]*?"title":"([^"]*)"[\s\S]*?"addDate":"([^"]*)"/g)];
  const posts = [];
  for (const m of matches) {
    const logNo = m[1], title = decTitle(m[2]);
    if (!title || !logNo) continue;
    const d = String(m[3] || '').replace(/\s/g, '').replace(/\.$/, '').split('.'); // "2026. 11. 1." → ["2026","11","1"]
    const date = d.length === 3 ? `${d[0]}-${String(d[1]).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}` : '';
    posts.push({ title, link: `https://blog.naver.com/${blogId}/${logNo}`, date, desc: '' });
  }
  const totalM = text.match(/"totalCount":"?(\d+)"?/);
  const isLast = (!matches.length) || (matches.length < 30) || !!(totalM && page * 30 >= Number(totalM[1]));
  return { posts, isLast };
}

// 과거 글까지 '전체'(유지보수/스크립트용). importList는 페이지 단위 배치(fetchBlogPage)를 직접 쓴다.
async function fetchAllBlogPosts(blogId, maxPosts = 300) {
  const out = [];
  for (let page = 1; page <= 20 && out.length < maxPosts; page++) {
    const { posts, isLast } = await fetchBlogPage(blogId, page);
    out.push(...posts);
    if (isLast) break;
    await new Promise(r => setTimeout(r, 120)); // throttle
  }
  return out.slice(0, maxPosts);
}

// AI 추출: 각 글이 '방문형 매장 체험후기'인지 + 매장명/지역. 많으면 청크(60개)로 나눠 호출(전체 불러오기 대비).
async function extractChunk(posts, offset) {
  const KEY = process.env.OPENAI_API_KEY;
  const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!KEY || !posts.length) return [];
  const list = posts.map((p, i) => `${i}. 제목: ${p.title}${p.desc ? `\n   요약: ${p.desc}` : ''}`).join('\n');
  const sys = `너는 네이버 블로그 글이 '방문형 매장 체험 후기'인지 판별하고 매장명/지역을 추출한다. 맛집·카페·뷰티·숙박 등 방문해서 체험하는 '특정 상호의 매장' 후기만 isStoreReview=true. 관광지/명소/공원/일상글/정보글은 false. storeName은 지점명 포함 정식 상호(수식어·지역·업종 제외), region은 시/구/동이나 역명 등 위치.`;
  const user = `다음 글들을 분석해 {"results":[{"idx":번호,"isStoreReview":bool,"storeName":"매장명 또는 ''","region":"지역 또는 ''"}]} 형태 JSON으로만 답해.\n\n${list}`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0, response_format: { type: 'json_object' } }),
    });
    const j = await res.json();
    const o = JSON.parse(j.choices[0].message.content);
    const arr = o.results || o.items || (Array.isArray(o) ? o : []);
    return arr.map(r => ({ ...r, idx: (Number(r.idx) || 0) + offset })); // 청크 오프셋 보정 → 전역 idx
  } catch (e) { return []; }
}
async function extractPosts(posts) {
  const CHUNK = 60;
  if (posts.length <= CHUNK) return extractChunk(posts, 0);
  const jobs = [];
  for (let i = 0; i < posts.length; i += CHUNK) jobs.push(extractChunk(posts.slice(i, i + CHUNK), i)); // 청크 병렬
  return (await Promise.all(jobs)).flat();
}

// 매칭(메모리판): 미리 로드한 places 배열에서 매장명(공백무시 부분일치)+지역으로. 글마다 DB 풀스캔 방지용.
function matchPlaceInMem(places, storeName, region) {
  const sn = norm(storeName);
  if (sn.length < 2) return null;
  const sn6 = sn.slice(0, 6);
  const rows = places.filter(p => p._n.includes(sn6));
  if (!rows.length) return null;
  const reg = String(region || '').replace(/\s/g, '');
  const regHit = reg ? rows.filter(r => (r.address || '').replace(/\s/g, '').includes(reg.slice(0, 2))) : [];
  const cand = (regHit.length ? regHit : rows).slice(0, 50);
  cand.sort((a, b) => (b._n.includes(sn) ? 1 : 0) - (a._n.includes(sn) ? 1 : 0));
  const place = cand[0];
  const nameExact = place._n.includes(sn) || sn.includes(place._n);
  return { placeId: place.id, name: place.name, address: place.address, confidence: (regHit.length && nameExact) ? 'auto' : 'confirm' };
}

// DB 매칭: 매장명(공백무시 부분일치) 후보 → 지역(주소 포함)으로 좁힘 → 신뢰도 판정.
//  🟢auto = 지역 일치 AND 이름 포함관계 / 🟡confirm = 그 외(이름만 등) / null = 후보 없음.
async function matchPlace(db, storeName, region) {
  const sn = norm(storeName);
  if (sn.length < 2) return null;
  const rows = (await db.execute({
    sql: "SELECT id, name, address FROM places WHERE COALESCE(hidden,0)=0 AND REPLACE(name,' ','') LIKE ? LIMIT 20",
    args: ['%' + sn.slice(0, 6) + '%'],
  })).rows;
  if (!rows.length) return null;
  const reg = String(region || '').replace(/\s/g, '');
  const regHit = reg ? rows.filter(r => (r.address || '').replace(/\s/g, '').includes(reg.slice(0, 2))) : [];
  const cand = (regHit.length ? regHit : rows);
  cand.sort((a, b) => (norm(b.name).includes(sn) ? 1 : 0) - (norm(a.name).includes(sn) ? 1 : 0));
  const place = cand[0];
  const nameExact = norm(place.name).includes(sn) || sn.includes(norm(place.name));
  return { placeId: place.id, name: place.name, address: place.address, confidence: (regHit.length && nameExact) ? 'auto' : 'confirm' };
}

// 메인(배치): 블로그 → [{title, link, date, store, region, match, confidence}].
//  existingUrls=이미 등록된 후기 url(Set). **최신 페이지부터 순회하며 '아직 등록 안 된 글'을 batch(기본 30)개까지만** 모아 AI 분석.
//  → 한 번에 너무 많이 안 뜨고(검토 피로↓) AI도 ≤30건만(빠름). 등록 후 '다시 불러오기'하면 existingUrls가 늘어 자연히 그 다음(더 과거) 30개가 뜸.
//  done=true: 더 불러올 미등록 글이 없음(전부 등록했거나 블로그 끝까지 도달).
async function importList({ db, blogId, existingUrls = new Set(), batch = 30, maxPages = 20 }) {
  // 1) 최신부터 페이지 순회 → 미등록 글을 batch개 모을 때까지(또는 블로그 끝)
  const collected = [];
  let reachedEnd = false;
  for (let page = 1; page <= maxPages; page++) {
    const { posts, isLast } = await fetchBlogPage(blogId, page);
    for (const p of posts) { if (!existingUrls.has(p.link)) collected.push(p); }
    if (collected.length >= batch) break;      // 이 배치 분량 충분(뒤에 더 있을 수 있음)
    if (isLast) { reachedEnd = true; break; }   // 블로그 끝까지 왔는데 batch 미만 → 마지막 배치
    await new Promise(r => setTimeout(r, 120)); // throttle
  }
  const take = collected.slice(0, batch);
  // 모은 게 batch 미만이고 블로그 끝까지 왔으면, 이번이 마지막(더 없음)
  const done = reachedEnd && collected.length <= batch;
  if (!take.length) return { items: [], done: true };
  // 2) AI 추출(≤batch건 → 보통 청크 1회, 빠름)
  const ex = await extractPosts(take);
  const byIdx = {}; (ex || []).forEach(e => { if (e && e.idx != null) byIdx[e.idx] = e; });
  // 3) 매칭용 매장 메모리 1회 로드(글마다 DB 풀스캔 방지)
  let allPlaces = [];
  try { allPlaces = (await db.execute("SELECT id, name, address FROM places WHERE COALESCE(hidden,0)=0")).rows; allPlaces.forEach(p => { p._n = norm(p.name); }); } catch (e) {}
  const items = [];
  for (let i = 0; i < take.length; i++) {
    const p = take[i];
    const e = byIdx[i] || {};
    if (!e.isStoreReview) continue;                 // 매장 체험후기 아님 제외
    const mt = matchPlaceInMem(allPlaces, e.storeName, e.region);
    items.push({
      title: p.title, link: p.link, date: p.date,
      store: e.storeName || '', region: e.region || '',
      match: mt ? { placeId: mt.placeId, name: mt.name, address: mt.address } : null,
      confidence: mt ? mt.confidence : 'none',       // auto | confirm | none
    });
  }
  return { items, done };
}

module.exports = { importList, fetchBlogPosts, fetchBlogPage, fetchAllBlogPosts, extractPosts, matchPlace };
