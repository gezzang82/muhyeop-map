// 어드민 대시보드 통계 계산 + DB 캐시(_ 접두 = 서버리스 함수 카운트 제외).
// 10만 캠페인 집계라 매 요청 ~3초 → 결과를 stats_cache 테이블 1행에 저장.
// 엔드포인트는 신선하면 그 1행만 읽음(~130ms). 로컬 크롤러가 매 사이클 refresh해 항상 웜 유지.
const CACHE_KEY = 'dashboard';

async function computeCampaignStats(db) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const nh = "COALESCE(c.hidden,0)=0 AND COALESCE(p.hidden,0)=0";
  const act = `(c.deadline='' OR c.deadline IS NULL OR c.deadline >= '${today}')`;
  const chNames = ['블로그', '클립', '인스타그램', '릴스', '유튜브'];
  const chSel = chNames.map((ch, i) => `SUM(CASE WHEN ${act} AND c.channels LIKE '%"${ch}"%' THEN 1 ELSE 0 END) AS ch${i}`).join(', ');
  const ddDates = Array.from({ length: 8 }, (_, d) => new Date(Date.now() + 9 * 3600 * 1000 + d * 86400000).toISOString().slice(0, 10));
  const ddSel = ddDates.map((ds, d) => `SUM(CASE WHEN c.deadline='${ds}' THEN 1 ELSE 0 END) AS d${d}`).join(', ');
  const agg = (await db.execute(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN ${act} THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN c.source='user' THEN 1 ELSE 0 END) AS userReported,
      SUM(CASE WHEN c.source='user' AND date(c.created_at,'+9 hours')='${today}' THEN 1 ELSE 0 END) AS userToday,
      ${chSel}, ${ddSel}
    FROM campaigns c JOIN places p ON p.id=c.place_id WHERE ${nh}`
  )).rows[0] || {};
  const plat = (await db.execute(
    `SELECT c.platform AS k, COUNT(*) AS n FROM campaigns c JOIN places p ON p.id=c.place_id WHERE ${nh} AND ${act} GROUP BY c.platform ORDER BY n DESC`
  )).rows.map(r => ({ platform: r.k || '', n: Number(r.n || 0) }));
  const placeCount = Number((await db.execute("SELECT COUNT(*) AS n FROM places WHERE COALESCE(hidden,0)=0")).rows[0]?.n || 0);
  const channels = chNames.map((ch, i) => ({ channel: ch, n: Number(agg['ch' + i] || 0) })).filter(x => x.n > 0);
  const dday = {}; for (let d = 0; d <= 7; d++) dday[d] = Number(agg['d' + d] || 0);
  let reviewCount = 0, reviewTodayCount = 0;
  try {
    const rv = (await db.execute(`SELECT COUNT(*) AS total, SUM(CASE WHEN date(created_at,'+9 hours')='${today}' THEN 1 ELSE 0 END) AS today FROM reviews WHERE COALESCE(hidden,0)=0`)).rows[0] || {};
    reviewCount = Number(rv.total || 0); reviewTodayCount = Number(rv.today || 0);
  } catch (e) {}
  return {
    placeCount, total: Number(agg.total || 0), active: Number(agg.active || 0),
    userReported: Number(agg.userReported || 0), userReportedToday: Number(agg.userToday || 0),
    reviewCount, reviewTodayCount,
    platforms: plat, channels, dday,
  };
}

async function ensureTable(db) {
  try { await db.execute("CREATE TABLE IF NOT EXISTS stats_cache (cache_key TEXT PRIMARY KEY, data TEXT, updated_at INTEGER)"); } catch (e) {}
}

// DB 캐시에서 읽되 ttlMs 이내로 신선할 때만 반환(아니면 null).
async function getCachedStats(db, ttlMs) {
  try {
    await ensureTable(db);
    const row = (await db.execute({ sql: "SELECT data, updated_at FROM stats_cache WHERE cache_key=?", args: [CACHE_KEY] })).rows[0];
    if (row && (Date.now() - Number(row.updated_at)) < ttlMs) return JSON.parse(row.data);
  } catch (e) {}
  return null;
}

// 재계산 + DB 캐시 갱신. 반환=payload. (크롤러가 매 사이클 호출해 웜 유지)
async function refreshStatsCache(db) {
  const payload = await computeCampaignStats(db);
  try {
    await ensureTable(db);
    await db.execute({
      sql: "INSERT INTO stats_cache (cache_key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
      args: [CACHE_KEY, JSON.stringify(payload), Date.now()],
    });
  } catch (e) {}
  return payload;
}

module.exports = { computeCampaignStats, getCachedStats, refreshStatsCache };
