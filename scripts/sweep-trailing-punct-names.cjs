// 매장명 끝 구두점(. , · … 등) 제거 스윕. 운영 DB(TURSO_PROD_*). DRY 기본, 'apply'로 실제 쓰기.
//  레뷰 등 일부 플랫폼 매장명 끝 구두점 아티팩트('장수촌.'·'앤크.') 정리. 파서(cleanStoreName)도 같이 보강됨.
const fs = require('fs'), path = require('path');
const envTxt = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
function g(k){let m=envTxt.match(new RegExp('^'+k+'\\s*=\\s*"([\\s\\S]*?)"\\s*$','m'));if(m)return m[1];m=envTxt.match(new RegExp("^"+k+"\\s*=\\s*'([\\s\\S]*?)'\\s*$",'m'));if(m)return m[1];m=envTxt.match(new RegExp('^'+k+'\\s*=\\s*(.+)$','m'));return m?m[1].trim():'';}
const { createClient } = require('@libsql/client');
const db = createClient({ url: g('TURSO_PROD_URL'), authToken: g('TURSO_PROD_AUTH_TOKEN') });
const APPLY = process.argv[2] === 'apply';
const clean = s => String(s||'').replace(/[.．。…]+\s*$/, '').trim();  // 마침표/말줄임표만(쉼표·가운뎃점 보존=의도적 브랜드명)
(async () => {
  const rows = (await db.execute("SELECT id, name FROM places WHERE name LIKE '%.' OR name LIKE '%．' OR name LIKE '%。' OR name LIKE '%…'")).rows;
  const targets = rows.map(r => ({ id: r.id, from: r.name, to: clean(r.name) })).filter(t => t.to && t.to !== t.from);
  console.log(`대상 ${targets.length}건 (DRY=${!APPLY})`);
  targets.forEach(t => console.log(`  #${t.id} "${t.from}" → "${t.to}"`));
  if (!APPLY) { console.log('\n[DRY] 쓰기 안 함. apply 인자로 실제 적용.'); return; }
  let done = 0;
  for (const t of targets) { await db.execute({ sql: "UPDATE places SET name=? WHERE id=?", args: [t.to, t.id] }); done++; }
  console.log(`\n✓ ${done}건 정리 완료`);
})();
