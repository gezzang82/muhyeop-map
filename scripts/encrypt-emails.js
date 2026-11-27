// 이메일 필드 at-rest 암호화 마이그레이션 (운영, TURSO_PROD_* + SESSION_SECRET).
//  대상: users.email · places.founder_email · campaigns.reporter_email 의 **평문(=enc:v1: 프리픽스 없는 non-empty)만** 암호화.
//  멱등: 이미 암호문(enc:v1:)이거나 빈값이면 skip. 배치 UPDATE.
//  사용: node scripts/encrypt-emails.js          (DRY — 건수 + 샘플 복호화 검증 + 키일치 게이트)
//        node scripts/encrypt-emails.js apply     (실제 암호화)
//  ⚠️ 키 일치 필수: 마이그레이션 키(_crypto, SESSION_SECRET 파생)가 **배포된 함수의 키와 동일**해야 함.
//     - .env.local SESSION_SECRET == Vercel Production SESSION_SECRET 이어야 정상(workflow.md).
//     - DRY가 ①로컬 enc→dec 라운드트립 ②DB에 이미 있는 함수-암호화 샘플을 로컬 복호화(키일치 확인)를 수행.
//       배포(함수가 신규 이메일을 암호화) 후 샘플이 1건이라도 생기면 그걸로 키일치를 확정한 뒤 apply 권장.
const fs = require('fs');
const ef = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + ef, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const { encField, decField, isEncrypted } = require('../api/_crypto');

const APPLY = process.argv.includes('apply');
const BATCH = 500;
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// 각 테이블: { table, col, idCol } — 평문 행을 id 단위로 UPDATE.
const TARGETS = [
  { table: 'users', col: 'email', idCol: 'id' },
  { table: 'places', col: 'founder_email', idCol: 'id' },
  { table: 'campaigns', col: 'reporter_email', idCol: 'id' },
];

(async () => {
  if (!process.env.TURSO_PROD_URL || !process.env.TURSO_PROD_AUTH_TOKEN) { console.error('TURSO_PROD_* 없음'); process.exit(1); }
  if (!process.env.SESSION_SECRET) { console.error('SESSION_SECRET 없음(_crypto 키 파생 불가)'); process.exit(1); }
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });

  console.log(`${APPLY ? '🔴 APPLY' : '🟡 DRY'} | 이메일 at-rest 암호화 마이그레이션\n`);

  // ── 1) 로컬 _crypto 라운드트립(키가 로드되고 enc/dec 동작하는지) ──
  {
    const probe = 'migration-selftest@muhyeop.map';
    const e = encField(probe);
    if (!isEncrypted(e) || decField(e) !== probe) { console.error('❌ 로컬 _crypto 라운드트립 실패 — 중단'); process.exit(1); }
    console.log('① 로컬 라운드트립 OK (enc→dec 일치)');
  }

  // ── 2) 키 일치 게이트: DB에 이미 있는 '함수-암호화' 샘플(enc:v1:)을 로컬에서 복호화 ──
  //    배포 후 함수가 쓴 암호문을 로컬 키로 복호화 성공하면 = .env.local 키 == 운영 키 (안전).
  {
    let fnSample = null, fnTable = null;
    for (const t of TARGETS) {
      const r = await db.execute(`SELECT ${t.col} v FROM ${t.table} WHERE ${t.col} LIKE 'enc:v1:%' LIMIT 1`);
      if (r.rows.length) { fnSample = r.rows[0].v; fnTable = t.table; break; }
    }
    if (fnSample) {
      const dec = decField(fnSample);
      if (dec && dec.includes('@')) {
        console.log(`② 키 일치 확인 OK — ${fnTable}의 기존 암호문을 로컬 키로 복호화 성공(이메일 형태). 운영 키 == 로컬 키.`);
      } else {
        console.error(`❌ 키 불일치 의심 — ${fnTable}의 암호문을 로컬 키로 복호화했으나 이메일이 아님(결과="${dec}").`);
        console.error('   .env.local SESSION_SECRET 이 Vercel Production 과 다를 수 있음. apply 중단.');
        process.exit(1);
      }
    } else {
      console.log('② 키 일치 확인 SKIP — DB에 함수-암호화 샘플(enc:v1:) 아직 없음.');
      console.log('   권장: 먼저 배포→로그인 유저가 이메일 저장(함수가 1건 암호화)→이 DRY 재실행으로 키일치 확정 후 apply.');
    }
  }

  // ── 3) 테이블별 평문 건수 + apply ──
  console.log('\n③ 테이블별 평문 이메일 처리:');
  let grandPlain = 0;
  for (const t of TARGETS) {
    // 평문 = non-empty AND NOT enc:v1: 프리픽스
    const rows = (await db.execute(
      `SELECT ${t.idCol} id, ${t.col} v FROM ${t.table} WHERE ${t.col} IS NOT NULL AND ${t.col} != '' AND ${t.col} NOT LIKE 'enc:v1:%'`
    )).rows;
    const encCnt = Number((await db.execute(`SELECT COUNT(*) n FROM ${t.table} WHERE ${t.col} LIKE 'enc:v1:%'`)).rows[0].n);
    grandPlain += rows.length;
    console.log(`  - ${t.table}.${t.col}: 평문 ${rows.length}건 암호화 대상 (이미 암호문 ${encCnt}건 skip)`);

    if (!rows.length) continue;

    if (!APPLY) {
      // DRY: 샘플 2건을 enc→dec 검증해 데이터 손상 없음 확인(실제 저장 안 함)
      const sample = rows.slice(0, 2);
      for (const s of sample) {
        const e = encField(s.v);
        const ok = decField(e) === String(s.v);
        console.log(`      샘플 id=${s.id}: enc→dec ${ok ? 'OK' : '❌불일치'} (평문 "${String(s.v).replace(/(.{2}).*(@.*)/, '$1***$2')}")`);
        if (!ok) { console.error('      ❌ 샘플 라운드트립 실패 — 중단'); process.exit(1); }
      }
      continue;
    }

    // APPLY: id별 UPDATE(배치)
    let done = 0;
    for (const part of chunk(rows, BATCH)) {
      for (const r of part) {
        const enc = encField(r.v);
        await db.execute({ sql: `UPDATE ${t.table} SET ${t.col} = ? WHERE ${t.idCol} = ?`, args: [enc, r.id] });
        done++;
      }
      console.log(`      ...${done}/${rows.length}`);
    }
    // 검증: 방금 암호화한 몇 건을 다시 읽어 복호화 일치 확인
    const verify = (await db.execute(
      `SELECT ${t.idCol} id, ${t.col} v FROM ${t.table} WHERE ${t.col} LIKE 'enc:v1:%' LIMIT 3`
    )).rows;
    for (const vr of verify) {
      const d = decField(vr.v);
      console.log(`      검증 id=${vr.id}: 복호화 ${d && d.includes('@') ? 'OK' : '❌'} `);
    }
  }

  console.log(`\n총 평문 대상 ${grandPlain}건.`);
  if (!APPLY) console.log('실행: node scripts/encrypt-emails.js apply');
  else console.log('✅ 완료.');
})().catch(e => { console.error(e); process.exit(1); });
