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
    '입력은 실제 체험단 플랫폼(디너의여왕)에서 수집돼 이미 1차 필터(서울 소재·주소 있음·배송형 제외)를 통과한 "신규 매장 + 협찬 캠페인" 후보다. 즉 기본적으로 진짜 캠페인이다.',
    '기본 방침: 특별한 문제가 없으면 approve=true. **협찬 내용이 짧거나("N만원 체험권" 등) 홍보성인 것은 체험단 특성상 정상이며, 그것만으로 반려하지 마라.** 카테고리가 틀린 것도 반려 사유가 아니라 교정 대상이다.',
    'approve=false로 두는 경우는 아래처럼 명확한 문제일 때만:',
    ' - 매장명이 의미 없거나 스팸/테스트성이라 실제 업체로 볼 수 없음',
    ' - 명백한 배송형/무매장(택배 상품 등)이 1차 필터를 빠져나온 경우',
    ' - similarPlaces에 후보와 사실상 "같은 가게"(같은 상호+같은 위치)가 있어 중복 → duplicateOf에 그 이름',
    'category는 내용에 맞게 교정(반드시 목록 중 하나): ' + VALID_CATEGORIES.join(', ') + '.',
    'similarPlaces는 후보와 "가까운 위치(반경 300m)"의 유사 이름 매장이다. 같은 브랜드 다른 지점("헤비스테이크 과천중앙점" vs "안산중앙점")·이름 일부만 겹치는 다른 업체("홍봉선간장게장" vs "봉선화빛")는 중복 아님. 애매하면 null.',
    'confidence는 "실제 등록 가능한 진짜 매장"이라는 확신도(0~1). 플랫폼 정상 데이터면 대개 0.8 이상이다. 0.6 미만일 때만 approve=false.',
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
  const approve = !!v.approve && !v.duplicateOf && conf >= 0.6;
  return {
    approve,
    category: cat,
    duplicateOf: v.duplicateOf || null,
    confidence: conf,
    reason: String(v.reason || '').slice(0, 200),
  };
}

module.exports = { judgeCandidate };
