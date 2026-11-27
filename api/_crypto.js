const crypto = require('crypto');

// 개인정보(이메일) 필드 레벨 암호화(at-rest 보호). AES-256-GCM.
//  저장 포맷: 'enc:v1:' + ivB64 + ':' + tagB64 + ':' + ctB64
//  - 키: PII_ENC_KEY(32B를 base64/hex로) 우선, 없으면 SESSION_SECRET에서 파생.
//    SESSION_SECRET은 .env.local=Vercel 동일하므로 함수/마이그레이션 키가 일치.
//  - decField: 'enc:v1:' 프리픽스가 아니면 레거시 평문으로 보고 그대로 반환(마이그레이션 전/중에도 안전).
//  - 복호화 실패 시 throw 하지 않고 ''(또는 원본) 반환 — 앱이 죽지 않게(로그만).
const PREFIX = 'enc:v1:';

let _key = null;
function getKey() {
  if (_key) return _key;
  const raw = process.env.PII_ENC_KEY;
  if (raw) {
    // base64 또는 hex로 준 32바이트 키 허용
    let buf = null;
    try { const b = Buffer.from(raw, 'base64'); if (b.length === 32) buf = b; } catch (e) {}
    if (!buf) { try { const b = Buffer.from(raw, 'hex'); if (b.length === 32) buf = b; } catch (e) {} }
    if (buf) { _key = buf; return _key; }
    // 길이가 안 맞으면 PII_ENC_KEY 문자열을 해시해 32B 파생
    _key = crypto.createHash('sha256').update(String(raw) + '|pii-v1').digest();
    return _key;
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET(또는 PII_ENC_KEY) 환경변수가 설정되지 않았습니다');
  _key = crypto.createHash('sha256').update(secret + '|pii-v1').digest();
  return _key;
}

// 평문 → 저장용 암호문. 빈 값/undefined/null은 '' 반환(평문 빈값과 동일 취급).
function encField(plain) {
  const s = (plain === null || plain === undefined) ? '' : String(plain);
  if (s === '') return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const ct = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + iv.toString('base64') + ':' + tag.toString('base64') + ':' + ct.toString('base64');
  } catch (e) {
    // 암호화 실패 시(키 문제 등) 평문을 저장하지 않도록 예외를 올림 — 호출부가 인지하게.
    throw e;
  }
}

// 저장값 → 평문. 'enc:v1:' 프리픽스면 복호화, 아니면 레거시 평문 passthrough.
function decField(stored) {
  const s = (stored === null || stored === undefined) ? '' : String(stored);
  if (s === '') return '';
  if (!s.startsWith(PREFIX)) return s; // 레거시 평문
  try {
    const parts = s.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const ct = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString('utf8');
  } catch (e) {
    // 복호화 실패(키 불일치·손상)해도 앱이 죽지 않게 빈 문자열 반환(로그만).
    try { console.error('[_crypto] decField 실패:', e && e.message); } catch (_e) {}
    return '';
  }
}

// 이미 암호화된 값인지(멱등 마이그레이션용)
function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

module.exports = { encField, decField, isEncrypted };
