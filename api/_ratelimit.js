// 레이트리밋 헬퍼 — 서버리스 인스턴스가 분산/휘발성이라 인메모리 대신 Turso 공유 카운터(고정 윈도우) 사용.
// 함수 카운트 제외(_ 접두). 저장 실패 시에는 가용성 우선으로 통과(fail-open).
const { getDb } = require('./_db');

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

let _tableReady = false;
async function ensureTable(db) {
  if (_tableReady) return;
  await db.execute(`CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  _tableReady = true;
}

// 고정 윈도우 카운터. { name, limit, windowSec, key? }
// 반환: { ok:true } | { ok:false, retryAfter }
async function rateLimit(req, { name, limit, windowSec, key }) {
  try {
    const db = getDb();
    await ensureTable(db);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSec);
    const expiresAt = windowStart + windowSec;
    const bucket = `${name}:${key || clientIp(req)}:${windowStart}`;
    const r = await db.execute({
      sql: `INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?)
            ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count`,
      args: [bucket, expiresAt]
    });
    const count = Number(r.rows[0]?.count || 1);
    // 만료 버킷 가끔 청소(테이블 무한 증가 방지)
    if (Math.random() < 0.02) {
      try { await db.execute({ sql: 'DELETE FROM rate_limits WHERE expires_at < ?', args: [now] }); } catch (e) {}
    }
    if (count > limit) return { ok: false, retryAfter: Math.max(1, expiresAt - now) };
    return { ok: true };
  } catch (e) {
    return { ok: true }; // fail-open
  }
}

// 초과 시 429 응답까지 처리. true면 계속 진행, false면 이미 응답을 보냈으니 호출부는 return 할 것.
async function enforceRateLimit(req, res, opts) {
  const r = await rateLimit(req, opts);
  if (!r.ok) {
    res.setHeader('Retry-After', String(r.retryAfter));
    res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    return false;
  }
  return true;
}

module.exports = { rateLimit, enforceRateLimit, clientIp };
