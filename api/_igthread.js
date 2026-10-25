// 스레드(@muhyeopmap) 크로스포스팅 (_ 접두 = 함수 카운트 제외)
// IG 카드/웹툰 발행 시 같은 이미지+요약 텍스트를 스레드에도 자동 발행.
// Threads API: graph.threads.net. 토큰은 ig_state 'threads_token'(env THREADS_ACCESS_TOKEN에서 시드).
// 토큰 없으면 조용히 스킵(= 비활성). 스레드는 링크 클릭이 되므로 CTA에 muhyeop.com/?ref=threads 넣음.

const TH = 'https://graph.threads.net/v1.0';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getState(db, k) { try { const r = await db.execute({ sql: 'SELECT v FROM ig_state WHERE k=?', args: [k] }); return r.rows[0] ? r.rows[0].v : null; } catch (_) { return null; } }
async function setState(db, k, v) { await db.execute({ sql: `INSERT INTO ig_state(k,v,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at`, args: [k, String(v)] }); }

async function getToken(db) {
  let v = await getState(db, 'threads_token');
  if (!v) { v = process.env.THREADS_ACCESS_TOKEN; if (v) await setState(db, 'threads_token', v); }
  return v || null;
}
async function getUserId(db, tok) {
  let id = await getState(db, 'threads_user_id');
  if (id) return id;
  const j = await (await fetch(`${TH}/me?fields=id,username&access_token=${encodeURIComponent(tok)}`)).json();
  if (!j.id) throw new Error('threads me: ' + JSON.stringify(j.error || j).slice(0, 140));
  await setState(db, 'threads_user_id', j.id);
  return j.id;
}

// IG 캡션 → 스레드용 텍스트(해시태그 덩어리 제거 + IG전용 CTA 제거 + 클릭가능 링크 추가, 500자 제한)
function toThreadText(caption) {
  let body = String(caption || '').split(/\n+#/)[0];
  body = body.split('\n').filter(l => !/프로필 링크|앱스토어|@muhyeopmap/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return (body + '\n\n📍 내 주변 협찬 보기 → https://muhyeop.com/?ref=threads\n#무협맵').slice(0, 490);
}

// 크로스포스트: 이미지+텍스트(이미지 없으면 텍스트만)
async function crossPost(db, caption, imageUrl) {
  const tok = await getToken(db);
  if (!tok) return { skipped: 'no-token' };
  const uid = await getUserId(db, tok);
  const text = toThreadText(caption);
  const body = { text, access_token: tok };
  if (imageUrl) { body.media_type = 'IMAGE'; body.image_url = imageUrl; } else { body.media_type = 'TEXT'; }
  let j = await (await fetch(`${TH}/${uid}/threads`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })).json();
  if (!j.id) throw new Error('threads container: ' + JSON.stringify(j.error || j).slice(0, 160));
  const cid = j.id;
  await sleep(imageUrl ? 3000 : 1000); // 이미지 처리 대기
  j = await (await fetch(`${TH}/${uid}/threads_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: cid, access_token: tok }) })).json();
  if (!j.id) throw new Error('threads publish: ' + JSON.stringify(j.error || j).slice(0, 160));
  return { posted: true, id: j.id };
}

module.exports = { crossPost, toThreadText };
