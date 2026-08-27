/**
 * 오토파일럿 AI 판정 (OpenAI/GPT)
 *
 * - 신규매장 후보(new_place)에만 호출한다. 기존매장 추가/갱신·결정론적 경고는 규칙이 처리.
 * - 하는 일 딱 2가지: ① 카테고리·내용 정합성 확인(필요 시 카테고리 교정) ② fuzzy 중복 판정
 *   (이름이 살짝 다른 기존 매장과 같은 곳인지). 사람이 승인 때 하던 판단만 대체.
 * - fetch로 OpenAI Chat Completions 직접 호출(SDK 의존성 추가 안 함). JSON 강제 응답.
 * - 새 api 파일 아님(_ 접두사 = 함수 카운트 제외).
 *
 * ⚠️ 페일세이프(보수적): 키 없음·호출 실패·응답 파싱 실패·판단 애매 → 전부 approve:false
 *    로 반환해 사람 검수큐(🟡)로 보낸다. AI가 확신할 때만 자동등록.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const VALID_CATEGORIES = ['음식점', '카페', '뷰티', '숙박/여가', '문화', '의류', '안경/잡화', '기타'];

function fail(reason) {
  return { approve: false, category: null, duplicateOf: null, confidence: 0, reason };
}

/**
 * @param {object} p
 * @param {string} p.name 매장명, p.address 주소, p.category 규칙이 매긴 카테고리
 * @param {string} p.content 협찬 내용, p.channel 채널(CSV)
 * @param {string[]} p.similarPlaces 이름이 비슷한 기존 매장명 목록(중복 판정용, 미리 추린 소수)
 * @returns {Promise<{approve:boolean, category:string|null, duplicateOf:string|null, confidence:number, reason:string}>}
 */
async function judgeCandidate(p) {
  if (!process.env.OPENAI_API_KEY) return fail('OPENAI_API_KEY 없음');

  const sys = [
    '너는 지역 협찬(체험단) 지도 서비스의 데이터 검수원이다.',
    '스크래핑으로 수집된 "신규 매장 + 협찬 캠페인" 후보 1건을 보고, 사람 검수 없이 지도에 자동 등록해도 되는지 판정한다.',
    '오등록이 사용자에게 그대로 노출되므로 조금이라도 애매하면 approve=false로 보내 사람이 보게 한다(보수적).',
    '판정 기준:',
    '1) 매장명·주소·협찬 내용이 서로 앞뒤가 맞고 실제 존재할 법한 업체인가.',
    '2) category가 내용과 맞는가. 틀렸으면 올바른 값으로 교정(반드시 아래 목록 중 하나): ' + VALID_CATEGORIES.join(', ') + '.',
    '3) similarPlaces는 후보와 "가까운 위치(반경 300m)"의 유사 이름 매장 목록이다. 이 중 후보와 사실상 "같은 가게"(같은 상호+같은 위치, 표기만 다름)가 있을 때만 중복이다 → duplicateOf에 그 이름. 그 외엔 null.',
    '   ⚠️ 같은 브랜드라도 지점이 다르면(예: "헤비스테이크 과천중앙점" vs "헤비스테이크 안산중앙점") 중복 아님. 이름 일부만 겹치는 다른 업체(예: "홍봉선간장게장" vs "봉선화빛")도 중복 아님. 애매하면 중복 아님(null)으로 둔다.',
    '내용이 광고·배송형·비지역 업체이거나 매장명이 불명확하면 approve=false.',
    'confidence는 0~1. 0.85 미만이면 approve=false로 둔다. 단, 중복 판정은 위 기준으로 보수적으로(같은 가게 확실할 때만).',
  ].join('\n');

  const user = JSON.stringify({
    name: p.name || '', address: p.address || '', category: p.category || '',
    content: p.content || '', channel: p.channel || '',
    similarPlaces: (p.similarPlaces || []).slice(0, 12),
  });

  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'verdict', strict: true,
            schema: {
              type: 'object', additionalProperties: false,
              properties: {
                approve: { type: 'boolean' },
                category: { type: 'string', enum: VALID_CATEGORIES },
                duplicateOf: { type: ['string', 'null'] },
                confidence: { type: 'number' },
                reason: { type: 'string' },
              },
              required: ['approve', 'category', 'duplicateOf', 'confidence', 'reason'],
            },
          },
        },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    });
  } catch (e) {
    return fail('OpenAI 호출 오류: ' + (e.message || e));
  }
  if (!res.ok) {
    let body = ''; try { body = await res.text(); } catch (e) {}
    return fail(`OpenAI ${res.status} ${body.slice(0, 120)}`);
  }

  let v;
  try {
    const data = await res.json();
    v = JSON.parse(data.choices[0].message.content);
  } catch (e) {
    return fail('OpenAI 응답 파싱 실패');
  }

  // 보수적 게이트: 중복이거나 저신뢰면 자동등록 거부(사람 검수큐로)
  const conf = Number(v.confidence) || 0;
  const cat = VALID_CATEGORIES.includes(v.category) ? v.category : (p.category || '기타');
  const approve = !!v.approve && !v.duplicateOf && conf >= 0.85;
  return {
    approve,
    category: cat,
    duplicateOf: v.duplicateOf || null,
    confidence: conf,
    reason: String(v.reason || '').slice(0, 200),
  };
}

module.exports = { judgeCandidate };
