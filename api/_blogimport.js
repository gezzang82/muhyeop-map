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

// AI 배치 1회: 각 글이 '방문형 매장 체험후기'인지 + 매장명/지역 추출. (오토파일럿과 동일한 OpenAI 직접 호출)
async function extractPosts(posts) {
  const KEY = process.env.OPENAI_API_KEY;
  const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!KEY || !posts.length) return [];
  const list = posts.map((p, i) => `${i}. 제목: ${p.title}\n   요약: ${p.desc}`).join('\n');
  const sys = `너는 네이버 블로그 글이 '방문형 매장 체험 후기'인지 판별하고 매장명/지역을 추출한다. 맛집·카페·뷰티·숙박 등 방문해서 체험하는 '특정 상호의 매장' 후기만 isStoreReview=true. 관광지/명소/공원/일상글/정보글은 false. storeName은 지점명 포함 정식 상호(수식어·지역·업종 제외), region은 시/구/동이나 역명 등 위치.`;
  const user = `다음 글들을 분석해 {"results":[{"idx":번호,"isStoreReview":bool,"storeName":"매장명 또는 ''","region":"지역 또는 ''"}]} 형태 JSON으로만 답해.\n\n${list}`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0, response_format: { type: 'json_object' } }),
    });
    const j = await res.json();
    const o = JSON.parse(j.choices[0].message.content);
    return o.results || o.items || (Array.isArray(o) ? o : []);
  } catch (e) { return []; }
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

// 메인: 블로그 → [{title, link, date, store, region, match, confidence}]. existingUrls=이미 등록된 후기 url(Set) 제외.
async function importList({ db, blogId, existingUrls = new Set() }) {
  const posts = await fetchBlogPosts(blogId);
  if (!posts.length) return { postCount: 0, items: [] };
  const ex = await extractPosts(posts);
  const byIdx = {}; (ex || []).forEach(e => { if (e && e.idx != null) byIdx[e.idx] = e; });
  const items = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    if (existingUrls.has(p.link)) continue;        // 이미 등록된 글 제외(중복 방지)
    const e = byIdx[i] || {};
    if (!e.isStoreReview) continue;                 // 매장 체험후기 아님 제외
    const mt = await matchPlace(db, e.storeName, e.region);
    items.push({
      title: p.title, link: p.link, date: p.date,
      store: e.storeName || '', region: e.region || '',
      match: mt ? { placeId: mt.placeId, name: mt.name, address: mt.address } : null,
      confidence: mt ? mt.confidence : 'none',       // auto | confirm | none
    });
  }
  return { postCount: posts.length, items };
}

module.exports = { importList, fetchBlogPosts, extractPosts, matchPlace };
