// 간단 비속어 필터(_ 접두 = 함수 카운트 제외). 커뮤니티 인사글 등 공개 입력에 사용.
// 완벽하지 않음(한글 욕설 우회 다양) — 흔한 표현 + 공백/기호 우회 정도를 잡는 수준.
// 과차단 방지를 위해 애매한 단어(새끼·존나 등 단독)는 강한 조합일 때만.

// 비교 전 정규화: 소문자 + 공백/구분기호 제거(ㅅ ㅂ, 시*발 같은 우회 완화)
function normalize(text) {
  return String(text || '').toLowerCase().replace(/[\s.,!?~\-_*^'"`()\[\]{}<>@#$%&+=/\\|]/g, '');
}

const PATTERNS = [
  /씨+발|시+발|씨+팔|시+팔|ㅅㅂ|ㅆㅂ|시+벌|씨+벌|쉬+발/,
  /병+신|ㅂㅅ/,
  /지+랄|ㅈㄹ/,
  /개+새+끼|쌍+놈|쌍+년|개+년|개+놈|개+자식/,   // '개같이/개멋짐' 등 긍정 강조는 제외
  /좆|좇|조+까|존+나|ㅈㄴ/,                        // '존맛' 등 긍정 슬랭은 제외

  /꺼+져|닥+쳐|닥+치|엿+먹/,
  /미+친+놈|미+친+년|또+라이|ㅄ|ㅗ/,
  /보+지|자+지|섹+스|야+동|성+교|자+위/,
  /창+녀|걸+레|호+로/,
  /느+금|니+애미|느+개비|니+미/,
  /fuck|shit|bitch|asshole|dick|pussy/,
];

function hasProfanity(text) {
  const s = normalize(text);
  if (!s) return false;
  return PATTERNS.some((re) => re.test(s));
}

module.exports = { hasProfanity, normalize };
