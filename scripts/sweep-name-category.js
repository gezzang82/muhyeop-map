// 매장명 오염 정리 + 고신뢰 카테고리 재분류 스윕 (운영 대상, TURSO_PROD_*).
// - 이름: cleanStoreName 재적용(대괄호 접두 [서구]/[클립], 안내 괄호 (새주소) 등 제거)
// - 카테고리: 이름신호 기반 고신뢰만(헤어/사진관/웨딩홀→음식점/청소→기타/짐배송→기타). 블랭킷 재분류는 오탐 많아 제외.
// 사용: node scripts/sweep-name-category.js        (DRY)
//       node scripts/sweep-name-category.js apply  (실제 적용)
const fs = require('fs');
const envfile = '.env' + '.local';
fs.readFileSync(__dirname + '/../' + envfile, 'utf8').split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); });
const { createClient } = require('@libsql/client');
const { cleanStoreName } = require('../api/_scrape.js');
const APPLY = process.argv[2] === 'apply';
const PHOTO = /사진관|셀프\s*사진|포토\s*부스|증명\s*사진|여권\s*사진|프로필\s*(?:사진|촬영|스튜디오)|바디\s*프로필|사진\s*스튜디오|셀프\s*스튜디오|스냅\s*사진|인생네컷|즉석\s*사진|흑백\s*사진|포토이즘|포토시그니처|하루필름|포토그레이|셀픽스|포토매틱|모노맨션/;
const HAIRNAME = /헤어|미용실|바버샵|바버|(?<![가-힣])이발/, HAIRPET = /반려|강아지|고양이|멍멍|애견|펫/, HAIRNOT = /네일|속눈썹|래쉬/;
(async () => {
  const db = createClient({ url: process.env.TURSO_PROD_URL, authToken: process.env.TURSO_PROD_AUTH_TOKEN });
  const rows = (await db.execute(`SELECT p.id,p.name,p.category,COALESCE(GROUP_CONCAT(c.content,' '),'') contents FROM places p LEFT JOIN campaigns c ON c.place_id=p.id WHERE COALESCE(p.hidden,0)=0 GROUP BY p.id`)).rows;
  const nameUpd = [], catUpd = [];
  for (const r of rows) {
    const N = r.name || '', C = (N + ' ' + (r.contents || ''));
    const cn = cleanStoreName(N); if (cn && cn !== N) nameUpd.push([r.id, cn]);
    let nc = null;
    if (HAIRNAME.test(N) && !HAIRPET.test(N) && !HAIRNOT.test(N)) nc = '헤어';
    else if (PHOTO.test(N)) nc = '사진관';
    else if (/웨딩홀|예식장|연회장/.test(N)) nc = '음식점';
    else if (r.category === '카페' && /카페트|카펫|매트리스|홈케어|하우스클리닝|입주청소|줄눈|(?<!년)청소(?!년)/.test(C)) nc = '기타';
    else if (r.category === '운동' && /짐\s*(?:배송|보관)/.test(C) && !/헬스|피트니스|휘트니스|필라테스|요가|골프|크로스핏|복싱|주짓수|테니스|스쿼시|클라이밍|\bPT\b/i.test(C)) nc = '기타';
    if (nc && nc !== r.category) catUpd.push([r.id, nc]);
  }
  console.log(`대상 ${rows.length} | ${APPLY ? 'APPLY' : 'DRY'} | 이름 ${nameUpd.length} · 카테고리 ${catUpd.length}`);
  if (APPLY) {
    for (const [id, nm] of nameUpd) await db.execute({ sql: 'UPDATE places SET name=? WHERE id=?', args: [nm, id] });
    for (const [id, cat] of catUpd) await db.execute({ sql: 'UPDATE places SET category=? WHERE id=?', args: [cat, id] });
    console.log('적용 완료');
  }
})().catch(e => console.error('ERR', e.message));
