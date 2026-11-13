// 후기 제목 백필 (운영 TURSO_PROD_*). og:title 작은따옴표 잘림 버그로 짧게 저장된 제목을 재조회해 교정.
// 사용: node scripts/backfill-review-titles.cjs            (DRY, 바뀔 것만 출력)
//       node scripts/backfill-review-titles.cjs apply      (실제 UPDATE)
//       node scripts/backfill-review-titles.cjs apply 50   (최대 50건만)
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const { fetchBlogPost, parseNaverBlogUrl } = require('../api/_reviews.js');
const APPLY = process.argv.includes('apply');
const LIMIT = parseInt(process.argv.find((a, i) => i > 1 && /^\d+$/.test(a)), 10) || 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });
  // 네이버 블로그 url(또는 blog_id+log_no) 있는 공개 후기 전부
  let rows = (await db.execute("SELECT id, title, url, blog_id, log_no FROM reviews WHERE COALESCE(hidden,0)=0 ORDER BY id DESC")).rows;
  if (LIMIT) rows = rows.slice(0, LIMIT);
  console.log('대상 후기:', rows.length, '건 재조회\n');
  let changed = 0, failed = 0, same = 0;
  const updates = [];
  for (const r of rows) {
    let blogId = r.blog_id, logNo = r.log_no;
    if ((!blogId || !logNo) && r.url) { const p = parseNaverBlogUrl(r.url); if (p) { blogId = p.blogId; logNo = p.logNo; } }
    if (!blogId || !logNo) { failed++; continue; }
    let post;
    try { post = await fetchBlogPost(blogId, logNo); } catch (e) { failed++; await sleep(120); continue; }
    const nt = (post && post.title || '').trim();
    await sleep(130);
    if (!nt || nt === '블로그 후기') { failed++; continue; }
    const old = (r.title || '').trim();
    if (nt === old) { same++; continue; }
    changed++;
    updates.push({ id: r.id, old, nt });
    if (changed <= 25) console.log(`#${r.id}\n  기존: ${old}\n  교정: ${nt}`);
    if (APPLY) await db.execute({ sql: "UPDATE reviews SET title=? WHERE id=?", args: [nt, r.id] });
  }
  console.log(`\n=== ${APPLY ? '적용' : 'DRY'} 요약: 변경 ${changed} · 동일 ${same} · 실패/스킵 ${failed} / 총 ${rows.length} ===`);
  if (!APPLY && changed) console.log('적용: node scripts/backfill-review-titles.cjs apply');
})();
