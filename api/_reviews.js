// 후기(리뷰) 헬퍼 — 네이버 블로그 URL 파싱/검증/추출 + 테이블/변환. 함수 카운트 제외(_ 접두).
// 초기엔 네이버 블로그(blog.naver.com)만 허용. 본문이 iframe(PostView)이라 그 프레임을 fetch해 매장명 매칭.

const UA = 'Mozilla/5.0 (compatible; muhyeop-map/1.0; +https://muhyeop-map.vercel.app)';

function normalize(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

// 입력 URL에서 blogId, logNo 추출 (지원: blog.naver.com/{id}/{logNo}, m.blog..., PostView.naver?blogId=&logNo=)
function parseNaverBlogUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch (e) { return null; }
  const host = url.hostname.replace(/^m\./, '');
  if (host !== 'blog.naver.com') return null;
  // PostView 형태
  const qBlogId = url.searchParams.get('blogId');
  const qLogNo = url.searchParams.get('logNo');
  if (qBlogId && qLogNo && /^\d+$/.test(qLogNo)) return { blogId: qBlogId, logNo: qLogNo };
  // /{blogId}/{logNo} 형태
  const m = url.pathname.match(/^\/([^/]+)\/(\d+)/);
  if (m) return { blogId: m[1], logNo: m[2] };
  return null;
}

function ogTag(html, prop) {
  const re1 = new RegExp('property=["\\\']og:' + prop + '["\\\']\\s+content=["\\\']([^"\\\']+)', 'i');
  const re2 = new RegExp('content=["\\\']([^"\\\']+)["\\\']\\s+property=["\\\']og:' + prop, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1].trim() : '';
}

function plainText(html) {
  let t = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// 블로그 글을 fetch해서 제목/썸네일/요약/본문텍스트 추출
async function fetchBlogPost(blogId, logNo) {
  const u = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(logNo)}`;
  let res;
  try {
    res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  } catch (e) { return null; }
  if (!res.ok) return null;
  const html = await res.text();
  const title = ogTag(html, 'title');
  const thumbnail = ogTag(html, 'image');
  let excerpt = ogTag(html, 'description');
  const body = plainText(html);
  if (!excerpt) excerpt = body.slice(0, 120);
  return { title, thumbnail, excerpt, body };
}

// URL + 매장명으로 검증 + 메타 추출. 반환: { ok, reason?, data? }
async function validateAndExtract(url, placeName) {
  const parsed = parseNaverBlogUrl(url);
  if (!parsed) return { ok: false, reason: '네이버 블로그(blog.naver.com) 주소만 등록할 수 있어요.' };
  const post = await fetchBlogPost(parsed.blogId, parsed.logNo);
  if (!post) return { ok: false, reason: '블로그 글을 불러오지 못했어요. 주소를 확인해주세요.' };
  const nameNorm = normalize(placeName);
  const haystack = normalize(post.title + ' ' + post.body);
  if (nameNorm && !haystack.includes(nameNorm)) {
    return { ok: false, reason: '후기 본문에서 매장명을 찾지 못했어요. 해당 매장 후기가 맞는지 확인해주세요.' };
  }
  return {
    ok: true,
    data: {
      url: `https://blog.naver.com/${parsed.blogId}/${parsed.logNo}`,
      blogId: parsed.blogId,
      logNo: parsed.logNo,
      title: post.title || '블로그 후기',
      thumbnail: post.thumbnail || '',
      excerpt: post.excerpt || '',
      author: parsed.blogId
    }
  };
}

async function ensureReviewTables(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    blog_id TEXT DEFAULT '',
    log_no TEXT DEFAULT '',
    title TEXT DEFAULT '',
    thumbnail TEXT DEFAULT '',
    excerpt TEXT DEFAULT '',
    author TEXT DEFAULT '',
    user_id INTEGER,
    like_count INTEGER DEFAULT 0,
    hidden INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS review_likes (
    review_id INTEGER NOT NULL,
    voter_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(review_id, voter_key)
  )`);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_reviews_place_id ON reviews(place_id, hidden, id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON review_likes(review_id)');
}

function toReview(row, liked) {
  return {
    id: row.id,
    placeId: row.place_id,
    url: row.url,
    title: row.title || '블로그 후기',
    thumbnail: row.thumbnail || '',
    excerpt: row.excerpt || '',
    author: row.user_nickname || row.author || '',
    likeCount: Number(row.like_count || 0),
    liked: !!liked,
    createdAt: row.created_at
  };
}

module.exports = { parseNaverBlogUrl, fetchBlogPost, validateAndExtract, ensureReviewTables, toReview, normalize };
