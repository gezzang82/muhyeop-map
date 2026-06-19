// 기존 app.js 목업 데이터를 Turso DB에 1회 시딩하는 스크립트
// 실행: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run seed
const { createClient } = require('@libsql/client');

const places = [
  { id: 1, name: "스시코우지 강남", address: "서울 강남구 테헤란로 152", lat: 37.5000, lng: 127.0370, category: "음식점", founderNickname: "맛집탐험가", founderUrl: "https://blog.naver.com/example1" },
  { id: 2, name: "올리브영 강남본점", address: "서울 강남구 강남대로 422", lat: 37.5012, lng: 127.0247, category: "뷰티", founderNickname: "뷰티로그", founderUrl: "https://blog.naver.com/example2" },
  { id: 3, name: "카페 노티드 청담", address: "서울 강남구 압구정로 428", lat: 37.5247, lng: 127.0430, category: "카페", founderNickname: "카페투어러", founderUrl: "https://instagram.com/example3" },
  { id: 4, name: "젝시믹스 강남점", address: "서울 강남구 강남대로 390", lat: 37.4975, lng: 127.0280, category: "의류", founderNickname: "", founderUrl: "" },
  { id: 5, name: "이니스프리 강남점", address: "서울 강남구 강남대로 438", lat: 37.5020, lng: 127.0260, category: "뷰티", founderNickname: "스킨케어러", founderUrl: "https://blog.naver.com/example5" },
  { id: 6, name: "할리스 압구정점", address: "서울 강남구 압구정로 20길 10", lat: 37.5270, lng: 127.0290, category: "카페", founderNickname: "카페순례자", founderUrl: "https://instagram.com/example6" },
  { id: 7, name: "메가커피 성수점", address: "서울 성동구 성수이로 78", lat: 37.5447, lng: 127.0557, category: "카페", founderNickname: "커피러버", founderUrl: "https://blog.naver.com/example7" },
  { id: 8, name: "ABC마트 홍대점", address: "서울 마포구 양화로 151", lat: 37.5573, lng: 126.9241, category: "의류", founderNickname: "스니커즈헌터", founderUrl: "https://instagram.com/example8" },
  { id: 9, name: "교촌치킨 이태원점", address: "서울 용산구 이태원로 180", lat: 37.5346, lng: 126.9938, category: "음식점", founderNickname: "치킨러버", founderUrl: "" },
  { id: 10, name: "네이처리퍼블릭 명동점", address: "서울 중구 명동길 53", lat: 37.5633, lng: 126.9820, category: "뷰티", founderNickname: "명동뷰티", founderUrl: "https://blog.naver.com/example10" },
  { id: 11, name: "스타벅스 선릉역점", address: "서울 강남구 테헤란로 310", lat: 37.5040, lng: 127.0490, category: "카페", founderNickname: "", founderUrl: "" },
  { id: 12, name: "이마트24 건대점", address: "서울 광진구 능동로 120", lat: 37.5403, lng: 127.0696, category: "기타", founderNickname: "편의점탐방", founderUrl: "" },
  { id: 13, name: "삼청각", address: "서울 성북구 북악산로 65", lat: 37.5917, lng: 126.9832, category: "음식점", founderNickname: "고궁맛집", founderUrl: "https://blog.naver.com/example13" },
  { id: 14, name: "무신사 스토어 홍대", address: "서울 마포구 어울마당로 35", lat: 37.5540, lng: 126.9226, category: "의류", founderNickname: "패션피플", founderUrl: "https://instagram.com/example14" },
  { id: 15, name: "아워홈 코엑스점", address: "서울 강남구 영동대로 513", lat: 37.5126, lng: 127.0590, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 16, name: "롭스 홍대점", address: "서울 마포구 와우산로 13", lat: 37.5560, lng: 126.9210, category: "뷰티", founderNickname: "홍대뷰티", founderUrl: "https://blog.naver.com/example16" },
  { id: 17, name: "투썸플레이스 잠실점", address: "서울 송파구 올림픽로 240", lat: 37.5135, lng: 127.1028, category: "카페", founderNickname: "디저트마니아", founderUrl: "https://instagram.com/example17" },
  { id: 18, name: "왓슨스 신촌점", address: "서울 서대문구 신촌로 83", lat: 37.5553, lng: 126.9370, category: "뷰티", founderNickname: "", founderUrl: "" },
  { id: 19, name: "파리바게뜨 여의도점", address: "서울 영등포구 국제금융로 10", lat: 37.5210, lng: 126.9241, category: "카페", founderNickname: "빵순이", founderUrl: "https://blog.naver.com/example19" },
  { id: 20, name: "GS25 서울숲점", address: "서울 성동구 뚝섬로 273", lat: 37.5436, lng: 127.0439, category: "기타", founderNickname: "편의점왕", founderUrl: "" },
  { id: 21, name: "젠틀몬스터 성수", address: "서울 성동구 성수이로 78", lat: 37.5445, lng: 127.0562, category: "안경/잡화", founderNickname: "스타일피플", founderUrl: "https://instagram.com/styleppl" },
  { id: 22, name: "탬버린즈 성수", address: "서울 성동구 왕십리로 83-21", lat: 37.5438, lng: 127.0548, category: "뷰티", founderNickname: "", founderUrl: "" },
  { id: 23, name: "카페 어니언 한남", address: "서울 용산구 한남대로 20길 33", lat: 37.5342, lng: 127.0016, category: "카페", founderNickname: "카페헌터", founderUrl: "https://blog.naver.com/cafehunter" },
  { id: 24, name: "이태원 브런치하우스", address: "서울 용산구 이태원로 196", lat: 37.5348, lng: 126.9951, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 25, name: "익선동 한옥카페 복희", address: "서울 종로구 수표로28길 17", lat: 37.5726, lng: 126.9942, category: "카페", founderNickname: "한옥러버", founderUrl: "https://instagram.com/hanoklover" },
  { id: 26, name: "광장시장 빈대떡골목", address: "서울 종로구 종로 88", lat: 37.5702, lng: 126.9993, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 27, name: "연남동 텃밭카페", address: "서울 마포구 연남로 33", lat: 37.5601, lng: 126.9248, category: "카페", founderNickname: "", founderUrl: "" },
  { id: 28, name: "합정 로우커피", address: "서울 마포구 양화로 186", lat: 37.5496, lng: 126.9148, category: "카페", founderNickname: "커피스타", founderUrl: "https://blog.naver.com/coffeestar" },
  { id: 29, name: "신촌 스타일난다", address: "서울 서대문구 신촌로 83", lat: 37.5551, lng: 126.9373, category: "의류", founderNickname: "", founderUrl: "" },
  { id: 30, name: "명동 설화수 플래그십", address: "서울 중구 명동길 62", lat: 37.5637, lng: 126.9837, category: "뷰티", founderNickname: "뷰티퀸", founderUrl: "https://blog.naver.com/beautyq" },
  { id: 31, name: "을지로 이탈리안 비스트로", address: "서울 중구 을지로 66", lat: 37.5661, lng: 126.9876, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 32, name: "잠실 롯데월드 어드벤처", address: "서울 송파구 올림픽로 240", lat: 37.5111, lng: 127.0982, category: "숙박/여가", founderNickname: "액티비티킹", founderUrl: "" },
  { id: 33, name: "석촌호수 레이크카페", address: "서울 송파구 석촌호수로 166", lat: 37.5085, lng: 127.0987, category: "카페", founderNickname: "", founderUrl: "" },
  { id: 34, name: "건대 삼겹화로", address: "서울 광진구 능동로 118", lat: 37.5400, lng: 127.0698, category: "음식점", founderNickname: "고기러버", founderUrl: "https://instagram.com/meatloverkr" },
  { id: 35, name: "서울숲 피크닉카페", address: "서울 성동구 뚝섬로 271", lat: 37.5442, lng: 127.0437, category: "카페", founderNickname: "", founderUrl: "" },
  { id: 36, name: "압구정 오뜨 피부과", address: "서울 강남구 압구정로 238", lat: 37.5270, lng: 127.0370, category: "뷰티", founderNickname: "스킨고수", founderUrl: "https://blog.naver.com/skinguru" },
  { id: 37, name: "청담 헤어살롱 알도", address: "서울 강남구 선릉로175길 10", lat: 37.5255, lng: 127.0502, category: "뷰티", founderNickname: "", founderUrl: "" },
  { id: 38, name: "가로수길 무신사 스탠다드", address: "서울 강남구 압구정로12길 5", lat: 37.5200, lng: 127.0220, category: "의류", founderNickname: "패션로그", founderUrl: "https://instagram.com/fashionlog_kr" },
  { id: 39, name: "서초 르쁘띠셰프", address: "서울 서초구 반포대로 45", lat: 37.5040, lng: 127.0055, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 40, name: "마포 네일살롱 핑크문", address: "서울 마포구 월드컵로 28", lat: 37.5580, lng: 126.9102, category: "뷰티", founderNickname: "네일아티스트J", founderUrl: "https://instagram.com/nailartistj" },
  { id: 41, name: "더현대서울 팝업존", address: "서울 영등포구 여의대로 108", lat: 37.5257, lng: 126.9289, category: "문화", founderNickname: "", founderUrl: "" },
  { id: 42, name: "여의도 IFC 바디샵", address: "서울 영등포구 국제금융로 10", lat: 37.5214, lng: 126.9246, category: "뷰티", founderNickname: "", founderUrl: "" },
  { id: 43, name: "상암 솥밥전문점 도담", address: "서울 마포구 월드컵북로 396", lat: 37.5793, lng: 126.8888, category: "음식점", founderNickname: "한식러버", founderUrl: "https://blog.naver.com/koreanfood" },
  { id: 44, name: "노원 샐러드팩토리", address: "서울 노원구 동일로 1415", lat: 37.6558, lng: 127.0634, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 45, name: "강동 허브스파", address: "서울 강동구 천호대로 1033", lat: 37.5387, lng: 127.1237, category: "숙박/여가", founderNickname: "힐링마니아", founderUrl: "https://blog.naver.com/healingmania" },
  { id: 46, name: "경복궁 뷰 한정식 담소", address: "서울 종로구 경복궁길 60", lat: 37.5793, lng: 126.9721, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 47, name: "이태원 스매쉬버거", address: "서울 용산구 이태원로 177", lat: 37.5345, lng: 126.9940, category: "음식점", founderNickname: "", founderUrl: "" },
  { id: 48, name: "성수 세컨드워드 빈티지", address: "서울 성동구 성수이로20가길 37", lat: 37.5443, lng: 127.0558, category: "의류", founderNickname: "빈티지헌터", founderUrl: "https://instagram.com/vintagehunter_kr" },
  { id: 49, name: "선릉 소스케 오마카세", address: "서울 강남구 테헤란로 420", lat: 37.5044, lng: 127.0499, category: "음식점", founderNickname: "오마카세고수", founderUrl: "https://blog.naver.com/omakaseguru" },
  { id: 50, name: "홍대 타코야키 타코", address: "서울 마포구 와우산로 29길 12", lat: 37.5558, lng: 126.9221, category: "음식점", founderNickname: "", founderUrl: "" }
];

const campaigns = [
  { id: 1, placeId: 1, platform: "레뷰", channels: ["블로그"], content: "오마카세 1인 체험 (80,000원 상당)", deadline: "2026-06-25", link: "https://www.revu.net", operatingDays: ["화","수","목","금","토"], operatingHours: "12:00~22:00", reporterNickname: "맛집탐험가", reporterBlog: "https://blog.naver.com/example1", reporterInstagram: "" },
  { id: 2, placeId: 2, platform: "리뷰노트", channels: ["블로그", "클립"], content: "신제품 스킨케어 체험", deadline: "2026-06-20", link: "https://www.reviewnote.co.kr", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "뷰티로그", reporterBlog: "https://blog.naver.com/example2", reporterInstagram: "" },
  { id: 3, placeId: 3, platform: "미블", channels: ["인스타그램"], content: "시즌 한정 음료 2잔", deadline: "2026-06-30", link: "https://mrble.net", operatingDays: [], operatingHours: "09:00~22:00", reporterNickname: "카페투어러", reporterBlog: "", reporterInstagram: "https://instagram.com/example3" },
  { id: 4, placeId: 4, platform: "강남맛집", channels: ["블로그"], content: "신상 레깅스 착용 리뷰", deadline: "2026-06-15", link: "https://www.gangnamfood.co.kr", operatingDays: ["월","화","수","목","금"], operatingHours: "", reporterNickname: "", reporterUrl: "" },
  { id: 7, placeId: 1, platform: "리뷰노트", channels: ["블로그", "클립"], content: "오마카세 2인 코스 체험 (150,000원 상당)", deadline: "2026-06-28", link: "https://www.reviewnote.co.kr", operatingDays: ["화","수","목","금","토"], operatingHours: "12:00~22:00", reporterNickname: "", reporterUrl: "" },
  { id: 5, placeId: 5, platform: "레뷰", channels: ["블로그"], content: "수분크림 + 토너 패드 세트 체험", deadline: "2026-05-31", link: "https://www.revu.net", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "스킨케어러", reporterUrl: "https://blog.naver.com/example5" },
  { id: 6, placeId: 6, platform: "미블", channels: ["인스타그램"], content: "시그니처 음료 2잔 + 케이크 1조각", deadline: "2026-06-01", link: "https://mrble.net", operatingDays: [], operatingHours: "08:00~22:00", reporterNickname: "카페순례자", reporterUrl: "https://instagram.com/example6" },
  { id: 8,  placeId: 7,  platform: "레뷰",      channels: ["블로그"],             content: "아메리카노 2잔 무료 체험",          deadline: "2026-07-10", link: "https://www.revu.net",              operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "08:00~22:00", reporterNickname: "커피러버",    reporterBlog: "https://blog.naver.com/example7",  reporterInstagram: "" },
  { id: 9,  placeId: 8,  platform: "디너의여왕", channels: ["인스타그램"],          content: "한정판 스니커즈 착용 리뷰",         deadline: "2026-07-05", link: "https://www.dinnersqueen.com",      operatingDays: [],                                   operatingHours: "11:00~21:00", reporterNickname: "스니커즈헌터", reporterBlog: "",                                  reporterInstagram: "https://instagram.com/example8" },
  { id: 10, placeId: 9,  platform: "강남맛집",   channels: ["블로그"],             content: "치킨 1마리 + 음료 2잔",            deadline: "2026-06-30", link: "https://www.gangnamfood.co.kr",     operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "16:00~01:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 11, placeId: 10, platform: "리뷰노트",   channels: ["블로그", "클립"],     content: "여름 신제품 선크림 세트",           deadline: "2026-07-15", link: "https://www.reviewnote.co.kr",      operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "명동뷰티",    reporterBlog: "https://blog.naver.com/example10",  reporterInstagram: "" },
  { id: 12, placeId: 11, platform: "미블",       channels: ["클립"],               content: "시즌 신메뉴 2종 체험",             deadline: "2026-07-20", link: "https://mrble.net",                 operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "07:00~23:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 13, placeId: 12, platform: "레뷰",       channels: ["블로그"],             content: "편의점 신상 도시락 3종 체험",       deadline: "2026-07-08", link: "https://www.revu.net",              operatingDays: [],                                   operatingHours: "24시간",      reporterNickname: "편의점탐방",   reporterBlog: "",                                  reporterInstagram: "" },
  { id: 14, placeId: 13, platform: "디너의여왕", channels: ["인스타그램"],          content: "궁중 코스 요리 2인 체험",          deadline: "2026-07-25", link: "https://www.dinnersqueen.com",      operatingDays: ["화","수","목","금","토","일"],      operatingHours: "12:00~22:00", reporterNickname: "고궁맛집",    reporterBlog: "https://blog.naver.com/example13",  reporterInstagram: "" },
  { id: 15, placeId: 14, platform: "강남맛집",   channels: ["블로그", "클립"],     content: "여름 신상 반바지 착용 리뷰",        deadline: "2026-07-01", link: "https://www.gangnamfood.co.kr",     operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "12:00~21:00", reporterNickname: "패션피플",    reporterBlog: "",                                  reporterInstagram: "https://instagram.com/example14" },
  { id: 16, placeId: 15, platform: "리뷰노트",   channels: ["블로그"],             content: "런치 세트 2인 무료 체험",           deadline: "2026-07-12", link: "https://www.reviewnote.co.kr",      operatingDays: ["월","화","수","목","금"],           operatingHours: "11:00~15:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 17, placeId: 16, platform: "미블",       channels: ["인스타그램"],          content: "여름 한정 스킨케어 3종 체험",       deadline: "2026-06-28", link: "https://mrble.net",                 operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "홍대뷰티",    reporterBlog: "https://blog.naver.com/example16",  reporterInstagram: "" },
  { id: 18, placeId: 17, platform: "레뷰",       channels: ["클립"],               content: "딸기 케이크 + 음료 세트",          deadline: "2026-07-18", link: "https://www.revu.net",              operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "디저트마니아", reporterBlog: "",                                  reporterInstagram: "https://instagram.com/example17" },
  { id: 19, placeId: 18, platform: "강남맛집",   channels: ["블로그"],             content: "여름 신상 선크림 2종 세트",         deadline: "2026-07-22", link: "https://www.gangnamfood.co.kr",     operatingDays: [],                                   operatingHours: "09:00~22:00", reporterNickname: "",            reporterBlog: "",                                  reporterInstagram: "" },
  { id: 20, placeId: 19, platform: "디너의여왕", channels: ["블로그", "클립"],     content: "여름 한정 샌드위치 + 음료 세트",    deadline: "2026-07-30", link: "https://www.dinnersqueen.com",      operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "08:00~21:00", reporterNickname: "빵순이",      reporterBlog: "https://blog.naver.com/example19",  reporterInstagram: "" },
  { id: 21, placeId: 20, platform: "리뷰노트",   channels: ["블로그", "인스타그램"], content: "편의점 신상 디저트 5종 체험",       deadline: "2026-07-14", link: "https://www.reviewnote.co.kr",      operatingDays: [],                                   operatingHours: "24시간",      reporterNickname: "편의점왕",    reporterBlog: "",                                  reporterInstagram: "" },
  { id: 22, placeId: 1,  platform: "레뷰",       channels: ["블로그", "인스타그램"], content: "오마카세 1인 런치 코스 체험 (12만원 상당)", deadline: "2026-07-31", link: "https://www.revu.net", operatingDays: ["화","수","목","금","토"], operatingHours: "12:00~15:00", excludeHoliday: true, reporterNickname: "맛집탐험가", reporterBlog: "https://blog.naver.com/example1", reporterInstagram: "" },
  { id: 23, placeId: 21, platform: "서울오빠", channels: ["인스타그램"], content: "신상 선글라스 착용 리뷰", deadline: "2026-07-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "스타일피플", reporterBlog: "", reporterInstagram: "https://instagram.com/styleppl" },
  { id: 28, placeId: 26, platform: "서울오빠", channels: ["클립"], content: "빈대떡 + 막걸리 세트 체험", deadline: "2026-07-05", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 33, placeId: 31, platform: "서울오빠", channels: ["블로그"], content: "파스타 + 피자 2인 코스 체험", deadline: "2026-07-22", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "12:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 43, placeId: 41, platform: "서울오빠", channels: ["클립", "인스타그램"], content: "팝업스토어 한정판 굿즈 + 포토존 체험", deadline: "2026-07-10", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:30~20:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 24, placeId: 22, platform: "리뷰플레이스", channels: ["블로그"], content: "여름 향수 + 바디로션 세트 체험", deadline: "2026-07-15", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 29, placeId: 27, platform: "리뷰플레이스", channels: ["블로그", "인스타그램"], content: "시즌 음료 2잔 + 홈메이드 샌드위치 세트", deadline: "2026-07-18", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 39, placeId: 37, platform: "리뷰플레이스", channels: ["인스타그램", "블로그"], content: "헤어 커트 + 트리트먼트 체험 (6만원 상당)", deadline: "2026-07-31", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "10:00~20:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 49, placeId: 47, platform: "리뷰플레이스", channels: ["인스타그램"], content: "시그니처 스매쉬버거 세트 2인", deadline: "2026-07-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 25, placeId: 23, platform: "포블로그", channels: ["블로그"], content: "시그니처 커피 + 크루아상 세트 체험", deadline: "2026-07-10", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:00~22:00", reporterNickname: "카페헌터", reporterBlog: "https://blog.naver.com/cafehunter", reporterInstagram: "" },
  { id: 30, placeId: 28, platform: "포블로그", channels: ["블로그", "클립"], content: "스페셜티 싱글오리진 커피 2잔", deadline: "2026-07-12", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "08:00~21:00", reporterNickname: "커피스타", reporterBlog: "https://blog.naver.com/coffeestar", reporterInstagram: "" },
  { id: 40, placeId: 38, platform: "포블로그", channels: ["클립"], content: "여름 신상 반팔 티셔츠 착용 리뷰", deadline: "2026-07-25", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "패션로그", reporterBlog: "", reporterInstagram: "https://instagram.com/fashionlog_kr" },
  { id: 45, placeId: 43, platform: "포블로그", channels: ["블로그"], content: "돌솥밥 정식 2인 세트 체험", deadline: "2026-07-08", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "한식러버", reporterBlog: "https://blog.naver.com/koreanfood", reporterInstagram: "" },
  { id: 26, placeId: 24, platform: "링블", channels: ["인스타그램"], content: "브런치 2인 세트 (에그베네딕트 + 음료 포함)", deadline: "2026-07-08", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:00~16:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 31, placeId: 29, platform: "링블", channels: ["인스타그램", "클립"], content: "여름 신상 원피스 착용 리뷰 (5만원 상당)", deadline: "2026-07-30", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 41, placeId: 39, platform: "링블", channels: ["블로그"], content: "런치 코스 2인 (파스타+수프+음료 포함)", deadline: "2026-07-18", link: "", operatingDays: ["월","화","수","목","금"], operatingHours: "12:00~15:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 50, placeId: 48, platform: "링블", channels: ["클립", "인스타그램"], content: "빈티지 의류 3만원 상당 스타일링 리뷰", deadline: "2026-07-28", link: "", operatingDays: ["수","목","금","토","일"], operatingHours: "13:00~20:00", reporterNickname: "빈티지헌터", reporterBlog: "", reporterInstagram: "https://instagram.com/vintagehunter_kr" },
  { id: 27, placeId: 25, platform: "체험뷰", channels: ["블로그"], content: "전통차 3종 + 한과 세트 체험", deadline: "2026-07-25", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "한옥러버", reporterBlog: "", reporterInstagram: "https://instagram.com/hanoklover" },
  { id: 32, placeId: 30, platform: "체험뷰", channels: ["블로그", "인스타그램"], content: "윤조에센스 풀사이즈 + 1:1 피부 컨설팅", deadline: "2026-08-05", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:30~20:00", reporterNickname: "뷰티퀸", reporterBlog: "https://blog.naver.com/beautyq", reporterInstagram: "" },
  { id: 42, placeId: 40, platform: "체험뷰", channels: ["인스타그램"], content: "젤네일 아트 1회 체험 (3만원 상당)", deadline: "2026-07-22", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "11:00~20:00", reporterNickname: "네일아티스트J", reporterBlog: "", reporterInstagram: "https://instagram.com/nailartistj" },
  { id: 47, placeId: 45, platform: "체험뷰", channels: ["블로그"], content: "아로마 허브 스파 풀코스 90분 체험", deadline: "2026-08-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "힐링마니아", reporterBlog: "https://blog.naver.com/healingmania", reporterInstagram: "" },
  { id: 34, placeId: 32, platform: "레뷰", channels: ["블로그", "클립"], content: "자유이용권 2인 + 포토부스 체험", deadline: "2026-08-10", link: "https://www.revu.net", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:30~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 44, placeId: 42, platform: "레뷰", channels: ["블로그"], content: "비타민C 브라이트닝 스킨케어 세트 체험", deadline: "2026-08-15", link: "https://www.revu.net", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 35, placeId: 33, platform: "리뷰노트", channels: ["인스타그램"], content: "호수뷰 시그니처 케이크 + 음료 2잔", deadline: "2026-07-28", link: "https://www.reviewnote.co.kr", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 51, placeId: 46, platform: "리뷰노트", channels: ["블로그", "클립"], content: "궁중 한정식 2인 코스 (10만원 상당)", deadline: "2026-08-05", link: "https://www.reviewnote.co.kr", operatingDays: ["화","수","목","금","토","일"], operatingHours: "12:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 36, placeId: 34, platform: "미블", channels: ["블로그"], content: "삼겹살 200g + 냉면 2인 세트", deadline: "2026-07-15", link: "https://mrble.net", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "16:00~01:00", reporterNickname: "고기러버", reporterBlog: "", reporterInstagram: "https://instagram.com/meatloverkr" },
  { id: 52, placeId: 44, platform: "미블", channels: ["인스타그램"], content: "프리미엄 샐러드 3종 + 음료 세트 체험", deadline: "2026-07-30", link: "https://mrble.net", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 37, placeId: 35, platform: "강남맛집", channels: ["인스타그램"], content: "피크닉 바구니 세트 1인 (음료+샌드위치+디저트)", deadline: "2026-07-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~19:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 53, placeId: 49, platform: "강남맛집", channels: ["블로그"], content: "오마카세 1인 저녁 코스 (15만원 상당)", deadline: "2026-08-12", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "18:00~22:00", excludeHoliday: true, reporterNickname: "오마카세고수", reporterBlog: "https://blog.naver.com/omakaseguru", reporterInstagram: "" },
  { id: 38, placeId: 36, platform: "디너의여왕", channels: ["블로그", "인스타그램"], content: "수분광 보습 레이저 시술 1회 체험", deadline: "2026-08-01", link: "https://www.dinnersqueen.com", operatingDays: ["월","화","수","목","금","토"], operatingHours: "10:00~19:00", reporterNickname: "스킨고수", reporterBlog: "https://blog.naver.com/skinguru", reporterInstagram: "" },
  { id: 48, placeId: 50, platform: "디너의여왕", channels: ["클립", "인스타그램"], content: "타코야키 20개 + 오코노미야키 세트", deadline: "2026-07-18", link: "https://www.dinnersqueen.com", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "12:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" }
];

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  const existing = await client.execute('SELECT COUNT(*) as cnt FROM places');
  if (existing.rows[0].cnt > 0) {
    console.log('이미 데이터가 있어 시딩을 건너뜁니다. (places:', existing.rows[0].cnt, ')');
    return;
  }

  for (const p of places) {
    await client.execute({
      sql: `INSERT INTO places (id, name, address, lat, lng, category, founder_nickname, founder_email, founder_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [p.id, p.name, p.address, p.lat, p.lng, p.category, p.founderNickname || '', p.founderEmail || '', p.founderUrl || '']
    });
  }
  console.log(`places ${places.length}건 삽입 완료`);

  for (const c of campaigns) {
    await client.execute({
      sql: `INSERT INTO campaigns (id, place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        c.id, c.placeId, c.platform, JSON.stringify(c.channels || []), c.content, c.deadline, c.link || '',
        JSON.stringify(c.operatingDays || []), c.operatingHours || '', c.excludeHoliday ? 1 : 0,
        c.reporterNickname || '', c.reporterEmail || '', c.reporterBlog || '', c.reporterInstagram || '', c.reporterUrl || ''
      ]
    });
  }
  console.log(`campaigns ${campaigns.length}건 삽입 완료`);

  // SQLite AUTOINCREMENT 시퀀스를 기존 최대 id 이후로 맞춤 (다음 INSERT가 51, 54부터 이어지도록)
  await client.execute(`UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM places) WHERE name = 'places'`);
  await client.execute(`UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM campaigns) WHERE name = 'campaigns'`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
