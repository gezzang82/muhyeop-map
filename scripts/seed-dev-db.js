/**
 * 로컬 dev DB(file:./dev.db) 생성 + 스키마 + 운영 샘플데이터 복사.
 * .env.local이 '운영'을 가리킬 때 실행해야 함(운영에서 읽어 로컬 파일로 씀).
 * 실행: node scripts/seed-dev-db.js
 */
const fs = require('fs'), path = require('path');
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { createClient } = require('@libsql/client');
// 운영 소스: TURSO_PROD_* 우선(로컬 전환 후에도 재시드 가능), 없으면 TURSO_DATABASE_URL
const prodUrl = process.env.TURSO_PROD_URL || process.env.TURSO_DATABASE_URL || '';
const prodToken = process.env.TURSO_PROD_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
if (prodUrl.startsWith('file:')) { console.error('⚠️ 운영 소스가 로컬(file:)입니다. .env.local에 TURSO_PROD_URL(운영)을 넣거나 TURSO_DATABASE_URL을 운영으로 두고 실행하세요.'); process.exit(1); }
const prod = createClient({ url: prodUrl, authToken: prodToken });
const DEV_PATH = path.join(__dirname, '..', 'dev.db');
try { fs.unlinkSync(DEV_PATH); } catch (e) {}
const dev = createClient({ url: 'file:' + DEV_PATH });

async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const s of stmts) { try { await dev.execute(s); } catch (e) { /* IF NOT EXISTS 등 무해 */ } }
  console.log(`스키마 적용: ${stmts.length}문`);
}
async function ensureColumns(table, cols) {
  // dev 테이블에 없는 컬럼(운영이 ALTER로 추가한 것)을 채움 — 스키마 드리프트 대응
  const info = (await dev.execute(`PRAGMA table_info(${table})`)).rows.map(r => r.name);
  for (const c of cols) {
    if (!info.includes(c)) { try { await dev.execute(`ALTER TABLE ${table} ADD COLUMN ${c}`); } catch (e) {} }
  }
}
async function copyRows(table, rows) {
  if (!rows.length) { console.log(`  ${table}: 0`); return; }
  const cols = Object.keys(rows[0]);
  await ensureColumns(table, cols);
  const ph = cols.map(() => '?').join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})`;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400).map(r => ({ sql, args: cols.map(c => r[c]) }));
    try { await dev.batch(chunk, 'write'); } catch (e) { console.error(`  ${table} 배치 오류:`, e.message); }
  }
  console.log(`  ${table}: ${rows.length}`);
}
(async () => {
  await applySchema();
  console.log('운영 → dev 복사 중...');
  // 지도/목록 UI 테스트용: 활성 캠페인 있는 매장 우선 + 좌표 있는 것 LIMIT
  const places = (await prod.execute("SELECT * FROM places WHERE lat IS NOT NULL AND COALESCE(hidden,0)=0 ORDER BY id DESC LIMIT 6000")).rows;
  await copyRows('places', places);
  const ids = places.map(p => p.id);
  // 그 매장들의 캠페인
  let camps = [];
  for (let i = 0; i < ids.length; i += 500) {
    const sub = ids.slice(i, i + 500);
    const r = await prod.execute({ sql: `SELECT * FROM campaigns WHERE place_id IN (${sub.map(() => '?').join(',')})`, args: sub });
    camps = camps.concat(r.rows);
  }
  await copyRows('campaigns', camps);
  // 배너 전체 + 후기 일부(후기 UI용)
  await copyRows('banners', (await prod.execute("SELECT * FROM banners")).rows);
  try { await copyRows('reviews', (await prod.execute("SELECT * FROM reviews WHERE COALESCE(hidden,0)=0 ORDER BY id DESC LIMIT 500")).rows); } catch (e) {}
  console.log('\n✅ dev.db 생성 완료:', DEV_PATH);
})().catch(e => { console.error(e); process.exit(1); });
