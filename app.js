// ===== 무협맵 app.js =====

// 데이터 구조: 장소(Places) + 캠페인(Campaigns)
let places = [
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

let campaigns = [
  {
    id: 1, placeId: 1, platform: "레뷰", channels: ["블로그"],
    content: "오마카세 1인 체험 (80,000원 상당)",
    deadline: "2026-06-25", link: "https://www.revu.net",
    operatingDays: ["화", "수", "목", "금", "토"], operatingHours: "12:00~22:00",
    reporterNickname: "맛집탐험가", reporterBlog: "https://blog.naver.com/example1", reporterInstagram: ""
  },
  {
    id: 2, placeId: 2, platform: "리뷰노트", channels: ["블로그", "클립"],
    content: "신제품 스킨케어 체험",
    deadline: "2026-06-20", link: "https://www.reviewnote.co.kr",
    operatingDays: ["월", "화", "수", "목", "금", "토", "일"], operatingHours: "10:00~22:00",
    reporterNickname: "뷰티로그", reporterBlog: "https://blog.naver.com/example2", reporterInstagram: ""
  },
  {
    id: 3, placeId: 3, platform: "미블", channels: ["인스타그램"],
    content: "시즌 한정 음료 2잔",
    deadline: "2026-06-30", link: "https://mrble.net",
    operatingDays: [], operatingHours: "09:00~22:00",
    reporterNickname: "카페투어러", reporterBlog: "", reporterInstagram: "https://instagram.com/example3"
  },
  {
    id: 4, placeId: 4, platform: "강남맛집", channels: ["블로그"],
    content: "신상 레깅스 착용 리뷰",
    deadline: "2026-06-15", link: "https://www.gangnamfood.co.kr",
    operatingDays: ["월", "화", "수", "목", "금"], operatingHours: "",
    reporterNickname: "", reporterUrl: ""
  },
  {
    id: 7, placeId: 1, platform: "리뷰노트", channels: ["블로그", "클립"],
    content: "오마카세 2인 코스 체험 (150,000원 상당)",
    deadline: "2026-06-28", link: "https://www.reviewnote.co.kr",
    operatingDays: ["화", "수", "목", "금", "토"], operatingHours: "12:00~22:00",
    reporterNickname: "", reporterUrl: ""
  },
  {
    id: 5, placeId: 5, platform: "레뷰", channels: ["블로그"],
    content: "수분크림 + 토너 패드 세트 체험",
    deadline: "2026-05-31", link: "https://www.revu.net",
    operatingDays: ["월", "화", "수", "목", "금", "토", "일"], operatingHours: "10:00~21:00",
    reporterNickname: "스킨케어러", reporterUrl: "https://blog.naver.com/example5"
  },
  {
    id: 6, placeId: 6, platform: "미블", channels: ["인스타그램"],
    content: "시그니처 음료 2잔 + 케이크 1조각",
    deadline: "2026-06-01", link: "https://mrble.net",
    operatingDays: [], operatingHours: "08:00~22:00",
    reporterNickname: "카페순례자", reporterUrl: "https://instagram.com/example6"
  },
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

  // 서울오빠
  { id: 23, placeId: 21, platform: "서울오빠", channels: ["인스타그램"], content: "신상 선글라스 착용 리뷰", deadline: "2026-07-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "스타일피플", reporterBlog: "", reporterInstagram: "https://instagram.com/styleppl" },
  { id: 28, placeId: 26, platform: "서울오빠", channels: ["클립"], content: "빈대떡 + 막걸리 세트 체험", deadline: "2026-07-05", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 33, placeId: 31, platform: "서울오빠", channels: ["블로그"], content: "파스타 + 피자 2인 코스 체험", deadline: "2026-07-22", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "12:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 43, placeId: 41, platform: "서울오빠", channels: ["클립", "인스타그램"], content: "팝업스토어 한정판 굿즈 + 포토존 체험", deadline: "2026-07-10", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:30~20:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },

  // 리뷰플레이스
  { id: 24, placeId: 22, platform: "리뷰플레이스", channels: ["블로그"], content: "여름 향수 + 바디로션 세트 체험", deadline: "2026-07-15", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 29, placeId: 27, platform: "리뷰플레이스", channels: ["블로그", "인스타그램"], content: "시즌 음료 2잔 + 홈메이드 샌드위치 세트", deadline: "2026-07-18", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 39, placeId: 37, platform: "리뷰플레이스", channels: ["인스타그램", "블로그"], content: "헤어 커트 + 트리트먼트 체험 (6만원 상당)", deadline: "2026-07-31", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "10:00~20:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 49, placeId: 47, platform: "리뷰플레이스", channels: ["인스타그램"], content: "시그니처 스매쉬버거 세트 2인", deadline: "2026-07-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },

  // 포블로그
  { id: 25, placeId: 23, platform: "포블로그", channels: ["블로그"], content: "시그니처 커피 + 크루아상 세트 체험", deadline: "2026-07-10", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:00~22:00", reporterNickname: "카페헌터", reporterBlog: "https://blog.naver.com/cafehunter", reporterInstagram: "" },
  { id: 30, placeId: 28, platform: "포블로그", channels: ["블로그", "클립"], content: "스페셜티 싱글오리진 커피 2잔", deadline: "2026-07-12", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "08:00~21:00", reporterNickname: "커피스타", reporterBlog: "https://blog.naver.com/coffeestar", reporterInstagram: "" },
  { id: 40, placeId: 38, platform: "포블로그", channels: ["클립"], content: "여름 신상 반팔 티셔츠 착용 리뷰", deadline: "2026-07-25", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "패션로그", reporterBlog: "", reporterInstagram: "https://instagram.com/fashionlog_kr" },
  { id: 45, placeId: 43, platform: "포블로그", channels: ["블로그"], content: "돌솥밥 정식 2인 세트 체험", deadline: "2026-07-08", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~21:00", reporterNickname: "한식러버", reporterBlog: "https://blog.naver.com/koreanfood", reporterInstagram: "" },

  // 링블
  { id: 26, placeId: 24, platform: "링블", channels: ["인스타그램"], content: "브런치 2인 세트 (에그베네딕트 + 음료 포함)", deadline: "2026-07-08", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "09:00~16:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 31, placeId: 29, platform: "링블", channels: ["인스타그램", "클립"], content: "여름 신상 원피스 착용 리뷰 (5만원 상당)", deadline: "2026-07-30", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "11:00~22:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 41, placeId: 39, platform: "링블", channels: ["블로그"], content: "런치 코스 2인 (파스타+수프+음료 포함)", deadline: "2026-07-18", link: "", operatingDays: ["월","화","수","목","금"], operatingHours: "12:00~15:00", reporterNickname: "", reporterBlog: "", reporterInstagram: "" },
  { id: 50, placeId: 48, platform: "링블", channels: ["클립", "인스타그램"], content: "빈티지 의류 3만원 상당 스타일링 리뷰", deadline: "2026-07-28", link: "", operatingDays: ["수","목","금","토","일"], operatingHours: "13:00~20:00", reporterNickname: "빈티지헌터", reporterBlog: "", reporterInstagram: "https://instagram.com/vintagehunter_kr" },

  // 체험뷰
  { id: 27, placeId: 25, platform: "체험뷰", channels: ["블로그"], content: "전통차 3종 + 한과 세트 체험", deadline: "2026-07-25", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~21:00", reporterNickname: "한옥러버", reporterBlog: "", reporterInstagram: "https://instagram.com/hanoklover" },
  { id: 32, placeId: 30, platform: "체험뷰", channels: ["블로그", "인스타그램"], content: "윤조에센스 풀사이즈 + 1:1 피부 컨설팅", deadline: "2026-08-05", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:30~20:00", reporterNickname: "뷰티퀸", reporterBlog: "https://blog.naver.com/beautyq", reporterInstagram: "" },
  { id: 42, placeId: 40, platform: "체험뷰", channels: ["인스타그램"], content: "젤네일 아트 1회 체험 (3만원 상당)", deadline: "2026-07-22", link: "", operatingDays: ["화","수","목","금","토"], operatingHours: "11:00~20:00", reporterNickname: "네일아티스트J", reporterBlog: "", reporterInstagram: "https://instagram.com/nailartistj" },
  { id: 47, placeId: 45, platform: "체험뷰", channels: ["블로그"], content: "아로마 허브 스파 풀코스 90분 체험", deadline: "2026-08-20", link: "", operatingDays: ["월","화","수","목","금","토","일"], operatingHours: "10:00~22:00", reporterNickname: "힐링마니아", reporterBlog: "https://blog.naver.com/healingmania", reporterInstagram: "" },

  // 기존 플랫폼 추가 캠페인
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

let nextPlaceId = 51;
let nextCampaignId = 54;
let currentChannelFilter = '전체';

let map;
let markers = [];
let markerCluster = null;
let openInfoWindow = null;
let openPcCardPlaceId = null;
let openPcCardPlace = null;
let pcCardPanTimer = null;
let markerMap = {}; // placeId → { marker, infoWindow }
let selectedMarkerId = null;

// 모달 상태
let modalSelectedPlaceId = null;
let modalIsNewPlace = true;
let modalSelectedLat = null;
let modalSelectedLng = null;
let modalSelectedAddress = "";

// ===== 상수 =====
// 카테고리별 지도 핀: 색상 + 화이트 아이콘 (viewBox 0 0 30 30 기준)
const CATEGORY_PINS = {
  '음식점':    { color: '#E82A2D', icon: '<path d="M11 21.6667V15.5667C10.4 15.4111 9.91667 15.0944 9.55 14.6167C9.18333 14.1389 9 13.6 9 13V8.33333H10.3333V12.3333H11V8.33333H12.3333V12.3333H13V8.33333H14.3333V13C14.3333 13.6 14.15 14.1389 13.7833 14.6167C13.4167 15.0944 12.9333 15.4111 12.3333 15.5667V21.6667H11ZM17.6667 21.6667V15.3167C17.0667 15.1167 16.5833 14.6972 16.2167 14.0583C15.85 13.4194 15.6667 12.6944 15.6667 11.8833C15.6667 10.8944 15.9278 10.0556 16.45 9.36667C16.9722 8.67778 17.6 8.33333 18.3333 8.33333C19.0667 8.33333 19.6944 8.68056 20.2167 9.375C20.7389 10.0694 21 10.9111 21 11.9C21 12.7111 20.8167 13.4333 20.45 14.0667C20.0833 14.7 19.6 15.1167 19 15.3167V21.6667H17.6667Z" fill="#fff"/>' },
  '카페':      { color: '#C07C58', icon: '<path d="M9.66667 21V19.6667H20.3333V21H9.66667ZM12.3333 18.3333C11.6 18.3333 10.9722 18.0722 10.45 17.55C9.92778 17.0278 9.66667 16.4 9.66667 15.6667V9H20.3333C20.7 9 21.0139 9.13056 21.275 9.39167C21.5361 9.65278 21.6667 9.96667 21.6667 10.3333V12.3333C21.6667 12.7 21.5361 13.0139 21.275 13.275C21.0139 13.5361 20.7 13.6667 20.3333 13.6667H19V15.6667C19 16.4 18.7389 17.0278 18.2167 17.55C17.6944 18.0722 17.0667 18.3333 16.3333 18.3333H12.3333ZM19 12.3333H20.3333V10.3333H19V12.3333Z" fill="#fff"/>' },
  '뷰티':      { color: '#FFB619', icon: '<path d="M18.3333 21.6667C18.1444 21.6667 17.9861 21.6028 17.8583 21.475C17.7306 21.3472 17.6667 21.1889 17.6667 21C17.6667 20.8111 17.7306 20.6528 17.8583 20.525C17.9861 20.3972 18.1444 20.3333 18.3333 20.3333H20.3333V19H18.3333C18.1444 19 17.9861 18.9361 17.8583 18.8083C17.7306 18.6806 17.6667 18.5222 17.6667 18.3333C17.6667 18.1444 17.7306 17.9861 17.8583 17.8583C17.9861 17.7306 18.1444 17.6667 18.3333 17.6667H20.3333V16.3333H18.3333C18.1444 16.3333 17.9861 16.2694 17.8583 16.1417C17.7306 16.0139 17.6667 15.8556 17.6667 15.6667C17.6667 15.4778 17.7306 15.3194 17.8583 15.1917C17.9861 15.0639 18.1444 15 18.3333 15H20.3333V13.6667H18.3333C18.1444 13.6667 17.9861 13.6028 17.8583 13.475C17.7306 13.3472 17.6667 13.1889 17.6667 13C17.6667 12.8111 17.7306 12.6528 17.8583 12.525C17.9861 12.3972 18.1444 12.3333 18.3333 12.3333H20.3333V11H18.3333C18.1444 11 17.9861 10.9361 17.8583 10.8083C17.7306 10.6806 17.6667 10.5222 17.6667 10.3333C17.6667 10.1444 17.7306 9.98611 17.8583 9.85833C17.9861 9.73056 18.1444 9.66667 18.3333 9.66667H21C21.3667 9.66667 21.6806 9.79722 21.9417 10.0583C22.2028 10.3194 22.3333 10.6333 22.3333 11V20.3333C22.3333 20.7 22.2028 21.0139 21.9417 21.275C21.6806 21.5361 21.3667 21.6667 21 21.6667H18.3333ZM10.3333 21.6667L7.66667 14.3333L11 12.3333V8.33333H13.6667V12.3333L17 14.3333L14.3333 21.6667H10.3333Z" fill="#fff"/>' },
  '숙박/여가': { color: '#B063CC', icon: '<path d="M8.33333 19.6667V15.6667C8.33333 15.3667 8.39444 15.0944 8.51667 14.85C8.63889 14.6056 8.8 14.3889 9 14.2V12.3333C9 11.7778 9.19444 11.3056 9.58333 10.9167C9.97222 10.5278 10.4444 10.3333 11 10.3333H13.6667C13.9222 10.3333 14.1611 10.3806 14.3833 10.475C14.6056 10.5694 14.8111 10.7 15 10.8667C15.1889 10.7 15.3944 10.5694 15.6167 10.475C15.8389 10.3806 16.0778 10.3333 16.3333 10.3333H19C19.5556 10.3333 20.0278 10.5278 20.4167 10.9167C20.8056 11.3056 21 11.7778 21 12.3333V14.2C21.2 14.3889 21.3611 14.6056 21.4833 14.85C21.6056 15.0944 21.6667 15.3667 21.6667 15.6667V19.6667H20.3333V18.3333H9.66667V19.6667H8.33333ZM15.6667 13.6667H19.6667V12.3333C19.6667 12.1444 19.6028 11.9861 19.475 11.8583C19.3472 11.7306 19.1889 11.6667 19 11.6667H16.3333C16.1444 11.6667 15.9861 11.7306 15.8583 11.8583C15.7306 11.9861 15.6667 12.1444 15.6667 12.3333V13.6667ZM10.3333 13.6667H14.3333V12.3333C14.3333 12.1444 14.2694 11.9861 14.1417 11.8583C14.0139 11.7306 13.8556 11.6667 13.6667 11.6667H11C10.8111 11.6667 10.6528 11.7306 10.525 11.8583C10.3972 11.9861 10.3333 12.1444 10.3333 12.3333V13.6667Z" fill="#fff"/>' },
  '문화':      { color: '#2A76E8', icon: '<path d="M13.1333 17.6667L15 16.2667L16.8333 17.6667L16.1333 15.4L18 13.9333H15.7333L15 11.6667L14.2667 13.9333H12L13.8333 15.4L13.1333 17.6667ZM9.66667 20.3333C9.3 20.3333 8.98611 20.2028 8.725 19.9417C8.46389 19.6806 8.33333 19.3667 8.33333 19V16.75C8.33333 16.6278 8.37222 16.5222 8.45 16.4333C8.52778 16.3444 8.62778 16.2889 8.75 16.2667C9.01667 16.1778 9.23611 16.0167 9.40833 15.7833C9.58056 15.55 9.66667 15.2889 9.66667 15C9.66667 14.7111 9.58056 14.45 9.40833 14.2167C9.23611 13.9833 9.01667 13.8222 8.75 13.7333C8.62778 13.7111 8.52778 13.6556 8.45 13.5667C8.37222 13.4778 8.33333 13.3722 8.33333 13.25V11C8.33333 10.6333 8.46389 10.3194 8.725 10.0583C8.98611 9.79722 9.3 9.66667 9.66667 9.66667H20.3333C20.7 9.66667 21.0139 9.79722 21.275 10.0583C21.5361 10.3194 21.6667 10.6333 21.6667 11V13.25C21.6667 13.3722 21.6278 13.4778 21.55 13.5667C21.4722 13.6556 21.3722 13.7111 21.25 13.7333C20.9833 13.8222 20.7639 13.9833 20.5917 14.2167C20.4194 14.45 20.3333 14.7111 20.3333 15C20.3333 15.2889 20.4194 15.55 20.5917 15.7833C20.7639 16.0167 20.9833 16.1778 21.25 16.2667C21.3722 16.2889 21.4722 16.3444 21.55 16.4333C21.6278 16.5222 21.6667 16.6278 21.6667 16.75V19C21.6667 19.3667 21.5361 19.6806 21.275 19.9417C21.0139 20.2028 20.7 20.3333 20.3333 20.3333H9.66667Z" fill="#fff"/>' },
  '의류':      { color: '#14B8A6', icon: '<g transform="translate(7 7)"><path d="M14.3998 12.1333L8.66651 7.83328V7.22661C9.76651 6.89994 10.5332 5.77994 10.2865 4.52661C10.1132 3.65328 9.41985 2.92661 8.54651 2.72661C7.02651 2.37994 5.66651 3.53328 5.66651 4.99994H6.99985C6.99985 4.44661 7.44651 3.99994 7.99985 3.99994C8.55318 3.99994 8.99985 4.44661 8.99985 4.99994C8.99985 5.55994 8.53985 6.01328 7.97985 5.99994C7.61985 5.99328 7.33318 6.29994 7.33318 6.65994V7.83328L1.59985 12.1333C1.08651 12.5199 1.35985 13.3333 1.99985 13.3333H7.99985H13.9998C14.6398 13.3333 14.9132 12.5199 14.3998 12.1333ZM3.99985 11.9999L7.99985 8.99994L11.9998 11.9999H3.99985Z" fill="#fff"/></g>' },
  '안경/잡화': { color: '#E84393', icon: '<path d="M10.3333 21.6667C9.96667 21.6667 9.65278 21.5361 9.39167 21.275C9.13056 21.0139 9 20.7 9 20.3333V12.3333C9 11.9667 9.13056 11.6528 9.39167 11.3917C9.65278 11.1306 9.96667 11 10.3333 11H11.6667C11.6667 10.0778 11.9917 9.29167 12.6417 8.64167C13.2917 7.99167 14.0778 7.66667 15 7.66667C15.9222 7.66667 16.7083 7.99167 17.3583 8.64167C18.0083 9.29167 18.3333 10.0778 18.3333 11H19.6667C20.0333 11 20.3472 11.1306 20.6083 11.3917C20.8694 11.6528 21 11.9667 21 12.3333V20.3333C21 20.7 20.8694 21.0139 20.6083 21.275C20.3472 21.5361 20.0333 21.6667 19.6667 21.6667H10.3333ZM17.3583 15.3583C18.0083 14.7083 18.3333 13.9222 18.3333 13H17C17 13.5556 16.8056 14.0278 16.4167 14.4167C16.0278 14.8056 15.5556 15 15 15C14.4444 15 13.9722 14.8056 13.5833 14.4167C13.1944 14.0278 13 13.5556 13 13H11.6667C11.6667 13.9222 11.9917 14.7083 12.6417 15.3583C13.2917 16.0083 14.0778 16.3333 15 16.3333C15.9222 16.3333 16.7083 16.0083 17.3583 15.3583ZM13 11H17C17 10.4444 16.8056 9.97222 16.4167 9.58333C16.0278 9.19444 15.5556 9 15 9C14.4444 9 13.9722 9.19444 13.5833 9.58333C13.1944 9.97222 13 10.4444 13 11Z" fill="#fff"/>' },
  '기타':      { color: '#8E8E8E', icon: '<circle cx="10" cy="15" r="1.5" fill="#fff"/><circle cx="15" cy="15" r="1.5" fill="#fff"/><circle cx="20" cy="15" r="1.5" fill="#fff"/>' }
};
const DEFAULT_PIN = { color: '#8E8E8E', icon: '<circle cx="15" cy="15" r="2.2" fill="#fff"/>' };

const PLATFORM_COLORS = {
  '레뷰': '#1D9E75', '리뷰노트': '#185FA5', '미블': '#854F0B',
  '강남맛집': '#993556', '디너의여왕': '#E05C00',
  '서울오빠': '#E8173A', '리뷰플레이스': '#5B3EC8',
  '포블로그': '#0066CC', '링블': '#00A86B', '체험뷰': '#FF6B00',
  '기타': '#666666'
};

function getCategoryPin(cat) {
  const p = CATEGORY_PINS[cat] || DEFAULT_PIN;
  return `<svg class="map-pin-svg" width="34" height="34" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">`
    + `<circle cx="15" cy="15" r="14" fill="#fff"/>`
    + `<circle cx="15" cy="15" r="14.5" stroke="#000" stroke-opacity="0.08"/>`
    + `<circle cx="15" cy="15" r="12" fill="${p.color}"/>`
    + p.icon
    + `</svg>`;
}

// 선택된 핀: 물방울(teardrop) 형태로 확대 + 흰 테두리 (기존 카테고리 아이콘 재사용)
function getCategoryPinSelected(cat) {
  const p = CATEGORY_PINS[cat] || DEFAULT_PIN;
  return `<svg class="map-pin-svg" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="M24 3.55675C28.5005 3.55684 32.8171 5.38047 36 8.63194H35.999C38.8639 11.5548 40.3793 14.8561 40.7793 18.3009C41.1758 21.7042 40.4635 25.0858 39.1445 28.212C36.533 34.4156 31.3755 40.005 26.457 43.631C25.7434 44.1586 24.8842 44.4444 24 44.4444C23.1152 44.4444 22.255 44.1583 21.541 43.63V43.629C16.6229 40.0028 11.4656 34.4127 8.85254 28.212C7.53549 25.0857 6.8255 21.7044 7.21973 18.2999V18.2989C7.61974 14.8559 9.13549 11.5565 12 8.63194L12.001 8.63097C15.1946 5.37825 19.5047 3.55254 24 3.55675Z" fill="${p.color}" stroke="#fff" stroke-width="1.77778"/>`
    + `<g transform="translate(3 1) scale(1.4)">${p.icon}</g>`
    + `</svg>`;
}

function setSelectedMarker(placeId) {
  if (selectedMarkerId === placeId) return;
  clearSelectedMarker();
  const entry = markerMap[placeId];
  const place = places.find(p => p.id === placeId);
  if (!entry || !place) return;
  entry.marker.setIcon({
    content: `<div class="map-pin map-pin-selected">${getCategoryPinSelected(place.category)}</div>`,
    anchor: new naver.maps.Point(24, 45)
  });
  entry.marker.setZIndex(1000);
  selectedMarkerId = placeId;
}

function clearSelectedMarker() {
  if (selectedMarkerId == null) return;
  const entry = markerMap[selectedMarkerId];
  const place = places.find(p => p.id === selectedMarkerId);
  if (entry && place) {
    entry.marker.setIcon({
      content: `<div class="map-pin">${getCategoryPin(place.category)}</div>`,
      anchor: new naver.maps.Point(17, 17)
    });
    entry.marker.setZIndex(0);
  }
  selectedMarkerId = null;
}
function getPlatformColor(p) { return PLATFORM_COLORS[p] || '#666666'; }

function getActiveCampaigns(placeId) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return campaigns.filter(c => {
    if (c.placeId !== placeId) return false;
    if (new Date(c.deadline) < today) return false;
    if (currentChannelFilter !== '전체' && !(c.channels || []).includes(currentChannelFilter)) return false;
    return true;
  });
}

function filterChannel(channel) {
  currentChannelFilter = channel;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    const ch = btn.dataset.channel || btn.textContent.replace(/\s/g, '');
    btn.classList.toggle('active', ch === channel);
  });
  renderAll();
}

function hasActiveCampaign(placeId) {
  return getActiveCampaigns(placeId).length > 0;
}

function getDeadlineText(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(deadline) - today) / 86400000);
  if (diff < 0) return { text: '마감됨', urgent: false };
  if (diff === 0) return { text: '오늘 마감!', urgent: true };
  if (diff <= 3) return { text: `D-${diff}`, urgent: true };
  return { text: `D-${diff}`, urgent: false };
}

// ===== 날짜 셀렉트 초기화 =====
function initDateSelects() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  const yearSel = document.getElementById('inputDeadlineYear');
  const monthSel = document.getElementById('inputDeadlineMonth');
  const daySel = document.getElementById('inputDeadlineDay');

  for (let i = y; i <= y + 1; i++) {
    yearSel.innerHTML += `<option value="${i}" ${i === y ? 'selected' : ''}>${i}</option>`;
  }
  for (let i = 1; i <= 12; i++) {
    monthSel.innerHTML += `<option value="${i}" ${i === m ? 'selected' : ''}>${i}</option>`;
  }
  updateDayOptions(y, m, d);
  setTimeout(syncDateTriggers, 0);

  yearSel.addEventListener('change', () => updateDayOptions(
    parseInt(yearSel.value), parseInt(monthSel.value)
  ));
  monthSel.addEventListener('change', () => updateDayOptions(
    parseInt(yearSel.value), parseInt(monthSel.value)
  ));
}

function updateDayOptions(year, month, selectedDay) {
  const daySel = document.getElementById('inputDeadlineDay');
  const current = selectedDay || parseInt(daySel.value) || 1;
  const maxDay = new Date(year, month, 0).getDate();
  daySel.innerHTML = '';
  for (let i = 1; i <= maxDay; i++) {
    daySel.innerHTML += `<option value="${i}" ${i === current ? 'selected' : ''}>${i}</option>`;
  }
}

function getSelectedDeadline() {
  const y = document.getElementById('inputDeadlineYear').value;
  const m = String(document.getElementById('inputDeadlineMonth').value).padStart(2, '0');
  const d = String(document.getElementById('inputDeadlineDay').value).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resetDateSelects() {
  const today = new Date();
  document.getElementById('inputDeadlineYear').value = today.getFullYear();
  document.getElementById('inputDeadlineMonth').value = today.getMonth() + 1;
  updateDayOptions(today.getFullYear(), today.getMonth() + 1, today.getDate());
  setTimeout(syncDateTriggers, 0);
}

// ===== 지도 초기화 =====
function initMap() {
  map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(37.5040, 127.0300),
    zoom: 14,
    mapTypeControl: false,
    scaleControl: false,
    logoControl: true,
    logoControlOptions: { position: naver.maps.Position.BOTTOM_LEFT },
    mapDataControl: false
  });

  // 모바일: 네이버 로고를 바텀시트 위로 올림
  if (window.innerWidth <= 640) {
    const liftNaverLogo = () => {
      const mapDiv = document.getElementById('map');
      const logoA = [...mapDiv.querySelectorAll('a')].find(a => {
        const r = a.getBoundingClientRect();
        return r.x < 80 && r.y > 100 && r.width > 0;
      });
      const logoContainer = logoA?.parentElement?.parentElement;
      if (logoContainer && logoContainer.style.bottom === '0px') {
        logoContainer.style.bottom = '86px';
      } else if (!logoContainer) {
        setTimeout(liftNaverLogo, 300);
      }
    };
    setTimeout(liftNaverLogo, 500);
  }

  naver.maps.Event.addListener(map, 'click', () => {
    closePcCard();
    if (openInfoWindow) { openInfoWindow.close(); openInfoWindow = null; }
    // 모바일: 지도 터치 시 사이드바 닫기
    if (window.innerWidth <= 640) {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.remove('expanded');
      sidebar.classList.remove('expanded-full');
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
      const arrow = document.getElementById('sidebarArrow');
      if (arrow) arrow.textContent = '︿';
    }
  });

  naver.maps.Event.addListener(map, 'zoom_changed', () => {
    if (window.innerWidth > 640) closePcCard();
  });

  // 지도 밖 영역 클릭 시 PC 카드 닫기
  document.addEventListener('click', (e) => {
    if (!openPcCardPlaceId) return;
    if (e.target.closest('.map-pin')) return;
    if (e.target.closest('#pcCard')) return;
    if (e.target.closest('#map') && !e.target.closest('.mobile-search-bar') && !e.target.closest('.btn-my-location')) return;
    closePcCard();
  });

  initDateSelects();
  renderAll();
  initSidebarScrollExpand();
  initSidebarSwipeToDismiss();
  initSheetSwipeToDismiss();
}

// ===== 마커 렌더 =====
function renderMarkers() {
  if (markerCluster) { markerCluster.setMap(null); markerCluster = null; }
  markers.forEach(m => m.setMap(null));
  markers = [];
  markerMap = {};
  selectedMarkerId = null;

  places.forEach(place => {
    const active = hasActiveCampaign(place.id);
    const icon = getCategoryPin(place.category);

    // 활성 캠페인 없으면 마커 미노출
    if (!active) return;

    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(place.lat, place.lng),
      icon: {
        content: `<div class="map-pin">${icon}</div>`,
        anchor: new naver.maps.Point(17, 17)
      }
    });

    naver.maps.Event.addListener(marker, 'click', () => {
      if (window.innerWidth <= 640) {
        // 모바일: 바텀시트
        openMobileSheet(place);
      } else {
        // PC: 팝업 카드
        openPcCard(place);
      }
    });

    markers.push(marker);
    markerMap[place.id] = { marker };
  });

  // 클러스터링
  if (typeof MarkerClustering !== 'undefined') {
    const clusterIcon = [{
      content: '<div class="cluster-marker"><span class="cluster-count">0</span></div>',
      size: new naver.maps.Size(44, 44),
      anchor: new naver.maps.Point(22, 22)
    }];

    markerCluster = new MarkerClustering({
      minClusterSize: 2,
      maxZoom: 14,
      map: map,
      markers: markers,
      disableClickZoom: false,
      gridSize: 80,
      icons: clusterIcon,
      indexGenerator: [1],
      stylingFunction: function(clusterMarker, count) {
        const el = clusterMarker.getElement();
        if (el) {
          const c = el.querySelector('.cluster-count');
          if (c) c.textContent = count;
        }
      }
    });
  } else {
    markers.forEach(m => m.setMap(map));
  }
}

// ===== 인포윈도우 =====
function createInfoContent(place) {
  const active = getActiveCampaigns(place.id);
  const ALL_DAYS = ['월','화','수','목','금','토','일'];

  const allChannels = [...new Set(active.flatMap(c => c.channels))];
  const channelIconsHtml = allChannels.map(ch =>
    CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}" style="border-radius:4px;display:block;">` : ''
  ).join('');

  const founderHtml = place.founderNickname ? `
    <div class="iw-founder">
      <span class="iw-founder-label">최초제보자</span>
      <div class="iw-founder-right">
        <img src="image/ic_workspace_premium_24.svg" width="24" height="24" alt="">
        <div class="iw-founder-name-group">
          ${place.founderUrl
            ? `<a class="iw-founder-name" href="${place.founderUrl}" target="_blank">${place.founderNickname}</a><img src="image/ic_chevron_right_blue.svg" class="iw-founder-chevron" alt="">`
            : `<span class="iw-founder-name">${place.founderNickname}</span>`}
        </div>
      </div>
    </div>` : '';

  const campaignsHtml = active.length > 0
    ? active.map((c, i) => {
        const dl = getDeadlineText(c.deadline);
        const ddayHtml = dl ? `<span class="iw-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : '';
        const color = getPlatformColor(c.platform);

        let daysHtml = '';
        if (c.operatingDays !== undefined) {
          const daysFormatted = ALL_DAYS.map(d => {
            const isActive = c.operatingDays.includes(d);
            return `<span style="color:${isActive ? '#000' : '#ccc'}">${d}</span>`;
          }).join(' ');
          const holidayBadge = c.excludeHoliday ? ` <span style="color:#aaa">/ 공휴일 불가</span>` : '';
          daysHtml = `
            <div class="iw-info-row">
              <div class="iw-info-label-group">
                <img src="image/ic_calendar_20.svg" width="20" height="20" alt="">
                <span class="iw-info-label">요일</span>
              </div>
              <span class="iw-info-value">${daysFormatted}${holidayBadge}</span>
            </div>`;
        }

        const hoursHtml = c.operatingHours ? `
          <div class="iw-info-row">
            <div class="iw-info-label-group">
              <img src="image/ic_clock_20.svg" width="20" height="20" alt="">
              <span class="iw-info-label">시간</span>
            </div>
            <span class="iw-info-value">${c.operatingHours}</span>
          </div>` : '';

        const reporterUrl = c.reporterBlog || c.reporterInstagram || c.reporterUrl || '';
        const reporterHtml = c.reporterNickname ? `
          <div class="iw-info-row">
            <div class="iw-info-label-group">
              <img src="image/ic_account_20.svg" width="20" height="20" alt="">
              <span class="iw-info-label">제보</span>
            </div>
            ${reporterUrl
              ? `<a class="iw-reporter-link" href="${reporterUrl}" target="_blank">${c.reporterNickname}</a><img src="image/ic_chevron_right_gray.svg" style="display:block;flex-shrink:0;" alt="">`
              : `<span class="iw-info-value">${c.reporterNickname}</span>`}
          </div>` : '';

        const divider = i > 0 ? '<div class="iw-divider"></div>' : '';

        return `
          ${divider}
          <div class="iw-campaign">
            <div class="iw-campaign-header">
              <div style="flex:1;min-width:0;">
                <span class="iw-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
              </div>
              ${ddayHtml}
            </div>
            <p class="iw-content">${c.content}</p>
            <div class="iw-info-rows">${daysHtml}${hoursHtml}${reporterHtml}</div>
          </div>`;
      }).join('')
    : '<div class="iw-empty">현재 모집 중인 캠페인이 없어요</div>';

  return `
    <div class="info-window">
      <div class="iw-place">
        <div class="iw-name-row">
          <div class="iw-name-text-group">
            <span class="iw-name">${place.name}</span>
            <div class="iw-channels">${channelIconsHtml}</div>
          </div>
          <button class="pc-card-close" onclick="closePcCard()">
            <img src="image/ic_text_clear_20.svg" width="16" height="16" alt="닫기">
          </button>
        </div>
        <div class="iw-address">${place.address}</div>
      </div>
      ${founderHtml ? `<div class="iw-meta-founder">${founderHtml}<div class="iw-divider"></div></div>` : '<div class="iw-divider iw-divider-top"></div>'}
      <div class="iw-campaigns-wrap">${campaignsHtml}</div>
    </div>`;
}

function createMobileDetailContent(place) {
  const active = getActiveCampaigns(place.id);

  // 채널 아이콘
  const allChannels = [...new Set(active.flatMap(c => c.channels))];
  const channelIconsHtml = allChannels.map(ch =>
    CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}">` : ''
  ).join('');

  // 최초제보
  const founderHtml = place.founderNickname ? `
    <div class="detail-founder">
      <span class="detail-founder-label">최초제보자</span>
      <div class="detail-founder-right">
        <img src="image/ic_workspace_premium_24.svg" width="24" height="24" alt="" class="detail-founder-icon-img">
        <div class="detail-founder-name-group">
          ${place.founderUrl
            ? `<a class="detail-founder-link" href="${place.founderUrl}" target="_blank">${place.founderNickname}</a><img src="image/ic_chevron_right_blue.svg" class="detail-founder-chevron" alt="">`
            : `<span class="detail-founder-link">${place.founderNickname}</span>`}
        </div>
      </div>
    </div>` : '';

  // 캠페인 카드
  const ALL_DAYS = ['월','화','수','목','금','토','일'];
  const WEEKEND = new Set(['토','일']);

  const campaignsHtml = active.map((c, i) => {
    const dl = getDeadlineText(c.deadline);
    const ddayHtml = dl ? `<span class="detail-dday ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : '';
    const color = getPlatformColor(c.platform);

    // 요일 렌더
    let daysHtml = '';
    if (c.operatingDays !== undefined) {
      const daysFormatted = ALL_DAYS
        .map(d => {
          const active = c.operatingDays.includes(d);
          return `<span class="${active ? 'day-active' : 'day-dim'}">${d}</span>`;
        })
        .join(' ');
      const holidayBadge = c.excludeHoliday ? ` <span class="holiday-badge-active">/ 공휴일 불가</span>` : '';
      daysHtml = `
        <div class="detail-info-row">
          <div class="detail-info-label-group">
            <img src="image/ic_calendar_20.svg" width="20" height="20" alt="" class="detail-info-icon">
            <span class="detail-info-label">요일</span>
          </div>
          <span class="detail-info-value">${daysFormatted}${holidayBadge}</span>
        </div>`;
    }

    const hoursHtml = c.operatingHours ? `
      <div class="detail-info-row">
        <div class="detail-info-label-group">
          <img src="image/ic_clock_20.svg" width="20" height="20" alt="" class="detail-info-icon">
          <span class="detail-info-label">시간</span>
        </div>
        <span class="detail-info-value">${c.operatingHours}</span>
      </div>` : '';

    const reporterUrl = c.reporterBlog || c.reporterInstagram || c.reporterUrl || '';
    const reporterHtml = c.reporterNickname ? `
      <div class="detail-info-row">
        <div class="detail-info-label-group">
          <img src="image/ic_account_20.svg" width="20" height="20" alt="" class="detail-info-icon">
          <span class="detail-info-label">제보</span>
        </div>
        ${reporterUrl
          ? `<a class="detail-info-reporter-link" href="${reporterUrl}" target="_blank">${c.reporterNickname}</a><img src="image/ic_chevron_right_gray.svg" class="detail-reporter-chevron" alt="">`
          : `<span class="detail-info-value">${c.reporterNickname}</span>`}
      </div>` : '';

    const divider = i > 0 ? '<div class="detail-divider"></div>' : '';

    return `
      ${divider}
      <div class="detail-campaign">
        <div class="detail-campaign-header">
          <div class="detail-campaign-tag-wrap">
            <span class="detail-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
          </div>
          ${ddayHtml}
        </div>
        <p class="detail-content">${c.content}</p>
        <div class="detail-info-rows">${daysHtml}${hoursHtml}${reporterHtml}</div>
      </div>`;
  }).join('');

  return `
    <div class="detail-fixed">
      <div class="detail-place">
        <div class="detail-name-row">
          <span class="detail-name">${place.name}</span>
          <div class="detail-channels">${channelIconsHtml}</div>
        </div>
        <div class="detail-address">${place.address}</div>
      </div>
      ${founderHtml ? `<div class="detail-meta-founder">${founderHtml}<div class="detail-divider"></div></div>` : '<div class="detail-divider detail-divider-top"></div>'}
    </div>
    <div class="detail-scroll">
      <div class="detail-campaigns-wrap">
        ${campaignsHtml}
      </div>
    </div>`;
}

// ===== 사이드바 렌더 =====
const CHANNEL_ICONS = {
  '블로그': 'image/ic_naver_blog_20.png',
  '클립': 'image/ic_clip_20.png',
  '인스타그램': 'image/ic_instagram_20.png',
  '유튜브': 'image/ic_youtube_20.png',
};

function renderSidebar() {
  const list = document.getElementById('campaignList');
  const countEl = document.getElementById('campaignCount');

  const bounds = map ? map.getBounds() : null;
  const visiblePlaces = bounds
    ? places.filter(p => bounds.hasLatLng(new naver.maps.LatLng(p.lat, p.lng)))
    : places;

  const activePlaces = visiblePlaces.filter(p => hasActiveCampaign(p.id));
  countEl.textContent = activePlaces.length;

  if (activePlaces.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺️</div>
        <p>모집 중인 협찬이 없어요.<br>첫 번째로 제보해보세요!</p>
      </div>`;
    return;
  }

  list.innerHTML = activePlaces.map(place => {
    const active = getActiveCampaigns(place.id);
    const earliest = active.reduce((min, c) => new Date(c.deadline) < new Date(min.deadline) ? c : min);
    const dl = getDeadlineText(earliest.deadline);

    // 채널 아이콘 (중복 제거)
    const channels = [...new Set(active.flatMap(c => c.channels))];
    const channelIconsHtml = channels.map(ch =>
      CHANNEL_ICONS[ch] ? `<img src="${CHANNEL_ICONS[ch]}" width="20" height="20" alt="${ch}">` : ''
    ).join('');

    // 캠페인 행들
    const campaignsHtml = active.map(c => {
      const color = getPlatformColor(c.platform);
      return `
        <div class="sb-campaign">
          <span class="sb-platform-tag" style="background:${color}29;color:${color}">${c.platform}</span>
          <span class="sb-content">${c.content}</span>
        </div>`;
    }).join('');

    return `
      <div class="sb-item" onclick="focusPlace(${place.id})">
        <div class="sb-row-name">
          <span class="sb-name">${place.name}</span>
          <div class="sb-channels">${channelIconsHtml}</div>
          ${dl ? `<span class="sb-deadline ${dl.urgent ? 'urgent' : ''}">${dl.text}</span>` : ''}
        </div>
        <div class="sb-address">${place.address}</div>
        ${campaignsHtml}
      </div>`;
  }).join('');
}

function moveToMyLocation() {
  if (!navigator.geolocation) { showToast('위치 정보를 사용할 수 없어요'); return; }
  const btn = document.querySelector('.btn-my-location');
  btn.style.opacity = '0.4';
  btn.disabled = true;
  const restore = () => { btn.style.opacity = ''; btn.disabled = false; };
  navigator.geolocation.getCurrentPosition(
    pos => {
      map.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
      map.setZoom(15);
      restore();
      renderSidebar();
    },
    () => { showToast('위치 권한을 허용해주세요'); restore(); }
  );
}

function focusPlace(placeId) {
  const place = places.find(p => p.id === placeId);
  if (!place) return;

  map.setCenter(new naver.maps.LatLng(place.lat, place.lng));
  map.setZoom(16);

  if (window.innerWidth <= 640) {
    // 모바일: 바텀시트 열고 사이드바 닫기
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('expanded');
    sidebar.classList.remove('expanded-full');
    const arrow = document.getElementById('sidebarArrow');
    if (arrow) arrow.textContent = '︿';
    setTimeout(() => openMobileSheet(place), 150);
    setTimeout(() => {
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
    }, 350);
  } else {
    // PC: 팝업 카드 열기
    setTimeout(() => openPcCard(place), 200);
  }
}

function panToCard(place) {
  const latlng = new naver.maps.LatLng(place.lat, place.lng);
  const proj = map.getProjection();
  if (proj) {
    const off = proj.fromCoordToOffset(latlng);
    off.y -= 24;
    const mapWidth = document.getElementById('map').offsetWidth;
    if (mapWidth > 640) off.x += (mapWidth / 2 - 390);
    map.panTo(proj.fromOffsetToCoord(off));
  } else {
    map.panTo(latlng);
  }
}

function openPcCard(place) {
  if (openPcCardPlaceId === place.id) { closePcCard(); return; }
  openPcCardPlaceId = place.id;
  openPcCardPlace = place;
  document.getElementById('pcCardContent').innerHTML = createInfoContent(place);
  document.getElementById('pcCard').classList.add('visible');
  setSelectedMarker(place.id);
  panToCard(place);
}

function closePcCard() {
  if (!openPcCardPlaceId) return;
  openPcCardPlaceId = null;
  openPcCardPlace = null;
  document.getElementById('pcCard').classList.remove('visible');
  clearSelectedMarker();
}

function renderAll() {
  renderMarkers();
  renderSidebar();
}

// ===== 지역 검색 =====
function searchRegion() {
  const query = document.getElementById('regionSearch').value.trim();
  if (!query) return;

  function trySearch(q, fallback) {
    naver.maps.Service.geocode({ query: q }, function(status, response) {
      const items = response?.v2?.addresses;
      if (status === naver.maps.Service.Status.OK && items?.length) {
        map.setCenter(new naver.maps.LatLng(parseFloat(items[0].y), parseFloat(items[0].x)));
        map.setZoom(15);
      } else if (fallback) {
        trySearch(fallback, null);
      } else {
        showToast('검색 결과가 없어요.<br>주소로 검색해보세요 (예: 강남구, 성수동)');
      }
    });
  }

  const alreadyPrefixed = /^서울|^경기|^인천|^부산|^대구|^광주|^대전/.test(query);
  trySearch(query, alreadyPrefixed ? null : '서울 ' + query);
}

function searchRegionMobile() {
  const el = document.getElementById('regionSearchMobile');
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
}

function searchRegionMobileTop() {
  const el = document.getElementById('regionSearchMobileTop');
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
  el.blur();
}

function searchRegionMobileOverlay() {
  const el = document.getElementById('regionSearchMobileOverlay');
  document.getElementById('regionSearch').value = el.value;
  searchRegion();
  el.blur();
}

// 네이버 로고 표시/숨김
function setNaverLogoVisible(visible) {
  const logo = document.querySelector('#map .naver_logo, #map [class*="logo"]');
  if (logo) logo.style.visibility = visible ? '' : 'hidden';
}

// ===== 바텀시트 토글 (모바일) =====
function toggleBottomSheet(e) {
  if (window.innerWidth > 640) return;
  const sidebar = document.getElementById('sidebar');
  // 헤더 영역 클릭 시에만 토글 (리스트 스크롤은 방해 안 함)
  if (e.target.closest('.sidebar-list') || e.target.closest('.sidebar-card')) return;
  const willExpand = !sidebar.classList.contains('expanded');
  // 스와이프 dismiss 후 남아있는 inline transform 초기화
  if (willExpand) { sidebar.style.transform = ''; sidebar.style.transition = ''; }
  sidebar.classList.toggle('expanded');
  if (!willExpand) {
    sidebar.classList.remove('expanded-full');
    setTimeout(() => {
      const list = document.getElementById('campaignList');
      if (list) list.scrollTop = 0;
    }, 350);
  }
  const isExpanded = sidebar.classList.contains('expanded');
  // 화살표 방향 전환 (닫힘: ︿ 위방향 → 열림: ﹀ 아래방향)
  const arrow = document.getElementById('sidebarArrow');
  if (arrow) arrow.textContent = isExpanded ? '﹀' : '︿';
  setNaverLogoVisible(!isExpanded);
  if (isExpanded) renderSidebar();
}

// 리스트 스크롤 시 바텀시트 높이 자동 확장/축소
function initSidebarScrollExpand() {
  const list = document.getElementById('campaignList');
  if (!list) return;
  list.addEventListener('scroll', () => {
    if (window.innerWidth > 640) return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('expanded')) return;
    // 한번 full 확장되면 닫기 전까지 유지 (scrollTop=0 돼도 축소 안 함)
    if (list.scrollTop > 10) {
      sidebar.classList.add('expanded-full');
    }
  }, { passive: true });
}

// ===== 주소 검색 =====
function searchAddress() {
  const query = document.getElementById('inputAddress').value.trim();
  if (!query) { showToast('주소를 입력해주세요'); return; }

  const resultDiv = document.getElementById('searchResult');
  resultDiv.innerHTML = '<div class="search-hint">검색 중...</div>';

  naver.maps.Service.geocode({ query }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK || !response.v2.addresses?.length) {
      resultDiv.innerHTML = '<div class="search-hint error">검색 결과가 없어요</div>';
      return;
    }
    resultDiv.innerHTML = response.v2.addresses.slice(0, 5).map(item => {
      const addr = (item.roadAddress || item.jibunAddress).replace(/'/g, "\\'");
      return `
        <div class="search-item" onclick="selectAddress('${addr}', ${item.y}, ${item.x})">
          <div class="item-name">${item.roadAddress || item.jibunAddress}</div>
          <div class="item-sub">${item.jibunAddress || ''}</div>
        </div>`;
    }).join('');
  });
}

function selectAddress(address, lat, lng) {
  modalSelectedAddress = address;
  modalSelectedLat = parseFloat(lat);
  modalSelectedLng = parseFloat(lng);
  clearFieldError('inputAddress');
  document.getElementById('inputAddress').value = address;

  // 가까운 좌표에 이미 등록된 장소 확인 (50m 이내)
  const parsedLat = parseFloat(lat), parsedLng = parseFloat(lng);
  const sameAddr = places.find(p => {
    const dLat = (p.lat - parsedLat) * 111000;
    const dLng = (p.lng - parsedLng) * 88000;
    return Math.sqrt(dLat * dLat + dLng * dLng) < 50;
  });
  if (sameAddr) {
    document.getElementById('searchResult').innerHTML =
      `<div class="selected-addr">${address}</div>
       <div class="addr-duplicate-warning">⚠️ 이 주소로 이미 <strong>${sameAddr.name}</strong>이 등록되어 있어요.
         <span class="addr-dup-select" onclick="selectExistingPlace(${sameAddr.id})">이 장소 선택하기 →</span>
       </div>`;
    return;
  }
  document.getElementById('searchResult').innerHTML = `<div class="selected-addr">${address}</div>`;
}

// ===== 기존 장소 검색 =====
function searchExistingPlaces(name, keepSelection = false) {
  const q = name.trim();
  if (!keepSelection) modalSelectedPlaceId = null;
  if (q.length < 2) { document.getElementById('existingPlacesSection').style.display = 'none'; return; }

  const normalize = s => s.replace(/\s/g, '').toLowerCase();
  const nq = normalize(q);
  const matches = places.filter(p => {
    const np = normalize(p.name);
    return np.includes(nq) || nq.includes(np) || np.includes(nq.slice(0, 3));
  });
  if (!matches.length) { document.getElementById('existingPlacesSection').style.display = 'none'; return; }

  document.getElementById('existingPlacesSection').style.display = 'block';
  document.getElementById('existingPlacesList').innerHTML = matches.map(p => `
    <div class="existing-item ${modalSelectedPlaceId === p.id ? 'selected' : ''}" onclick="selectExistingPlace(${p.id})">
      <div class="existing-item-info">
        <div class="existing-name">${p.name}</div>
        <div class="existing-addr">${p.address}</div>
      </div>
      <span class="existing-item-check ${modalSelectedPlaceId === p.id ? 'selected' : ''}">✓</span>
    </div>`).join('');
}

function selectExistingPlace(placeId) {
  const place = places.find(p => p.id === placeId);
  if (!place) return;

  if (modalSelectedPlaceId === placeId) {
    modalSelectedPlaceId = null;
    modalIsNewPlace = true;
    modalSelectedAddress = null;
    modalSelectedLat = null;
    modalSelectedLng = null;
    document.getElementById('inputAddress').value = '';
    document.getElementById('searchResult').innerHTML = '';
    searchExistingPlaces(place.name, false);
    return;
  }

  modalSelectedPlaceId = placeId;
  modalIsNewPlace = false;
  document.getElementById('inputName').value = place.name;
  document.getElementById('inputAddress').value = place.address;
  modalSelectedAddress = place.address;
  modalSelectedLat = place.lat;
  modalSelectedLng = place.lng;
  document.getElementById('searchResult').innerHTML = `<div class="selected-addr">${place.address}</div>`;
  clearFieldError('inputName');
  clearFieldError('inputAddress');
  searchExistingPlaces(place.name, true);
}

function clearExistingSelection() {
  modalSelectedPlaceId = null;
  modalIsNewPlace = true;
  ['inputName', 'inputAddress'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('searchResult').innerHTML = '';
  modalSelectedAddress = ''; modalSelectedLat = null; modalSelectedLng = null;
  document.getElementById('existingPlacesSection').style.display = 'none';
}

// ===== 모달 =====
function openAbout() {
  document.getElementById('aboutOverlay').classList.add('open');
}
function closeAbout() {
  document.getElementById('aboutOverlay').classList.remove('open');
}

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  resetModal();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function resetModal() {
  clearAllFieldErrors();
  modalSelectedPlaceId = null; modalIsNewPlace = true;
  modalSelectedLat = null; modalSelectedLng = null; modalSelectedAddress = '';
  document.getElementById('step1').style.display = 'flex';
  document.getElementById('step2').style.display = 'none';
  ['inputName','inputAddress','inputContent','inputHours','inputNickname','inputUrl']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('inputCategory').value = '';
  syncSelectTrigger('inputCategory');
  document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('inputPlatform').value = '';
  syncSelectTrigger('inputPlatform');
  const holiday = document.getElementById('holidayExclude');
  if (holiday) { holiday.classList.remove('active'); }
  document.getElementById('modalStickyHeader').classList.remove('show');
  document.querySelector('#modalOverlay .modal-header').style.display = 'flex';
  resetDateSelects();
  document.getElementById('searchResult').innerHTML = '';
  document.getElementById('existingPlacesSection').style.display = 'none';
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
}

function updateStepDots(step) {
  [document.getElementById('stepDots'), document.getElementById('stickyStepDots')].forEach(container => {
    if (!container) return;
    const dots = container.querySelectorAll('.step-dot');
    dots.forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i === step - 1) {
        d.classList.add('active');
        d.textContent = i + 1;
      } else if (i < step - 1) {
        d.classList.add('done');
        d.textContent = '✓';
      } else {
        d.textContent = i + 1;
      }
    });
  });
}

function showFieldError(fieldId) {
  const el = document.getElementById(fieldId === 'channel' ? 'channelError' : fieldId + 'Error');
  if (el) el.classList.add('show');
  const input = document.getElementById(fieldId === 'channel' ? null : fieldId + 'Trigger') ||
                document.getElementById(fieldId);
  if (input) input.classList.add('input-error');
}

function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId === 'channel' ? 'channelError' : fieldId + 'Error');
  if (el) el.classList.remove('show');
  const trigger = document.getElementById(fieldId + 'Trigger');
  const input = document.getElementById(fieldId);
  if (trigger) trigger.classList.remove('input-error');
  if (input) input.classList.remove('input-error');
}

function clearAllFieldErrors() {
  document.querySelectorAll('.field-error-msg').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function goStep2() {
  let valid = true;
  if (!document.getElementById('inputName').value.trim()) { showFieldError('inputName'); valid = false; }
  if (!modalSelectedLat) { showFieldError('inputAddress'); valid = false; }
  if (!valid) return;

  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'flex';
  // step2에서 modal-header 숨기기 (step2ScrollHeader가 대신 스크롤됨)
  document.querySelector('#modalOverlay .modal-header').style.display = 'none';
  updateStepDots(2);

  // step2 스크롤 시 sticky 헤더 표시
  const step2Body = document.getElementById('step2Body');
  step2Body.removeEventListener('scroll', handleStep2Scroll);
  step2Body.addEventListener('scroll', handleStep2Scroll, { passive: true });
  step2Body.scrollTop = 0;
  document.getElementById('modalStickyHeader').classList.remove('show');

  const name = document.getElementById('inputName').value.trim();
  const catField = document.getElementById('newPlaceCategoryField');

  if (!modalIsNewPlace) {
    catField.style.display = 'block';
    const place = places.find(p => p.id === modalSelectedPlaceId);
    document.getElementById('inputCategory').value = place.category || '';
    syncSelectTrigger('inputCategory');
    document.getElementById('founderSection').style.display = 'flex';
    document.getElementById('founderSectionTitle').textContent = '내 이름 남기기';
    document.getElementById('founderSectionDesc').textContent = '마감일까지 이 캠페인 제보자로 표시돼요';
    document.getElementById('selectedPlaceBadge').innerHTML =
      `<div class="selected-place-badge"><div class="badge-icon"></div><span class="badge-text"><strong>${place.name}</strong>에 새 캠페인 추가</span></div>`;
  } else {
    catField.style.display = 'block';
    document.getElementById('founderSection').style.display = 'flex';
    document.getElementById('founderSectionTitle').textContent = '내 이름 남기기';
    document.getElementById('founderSectionDesc').textContent = '새 장소 최초 제보자로 영구 등록돼요';
    document.getElementById('selectedPlaceBadge').innerHTML =
      `<div class="selected-place-badge"><div class="badge-icon"></div><span class="badge-text"><strong>${name}</strong> 새로 등록</span></div>`;
  }
}

function goStep1() {
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  document.querySelector('#modalOverlay .modal-header').style.display = 'flex';
  document.getElementById('modalStickyHeader').classList.remove('show');
  updateStepDots(1);
}

function toggleOptional() {
  const fields = document.getElementById('optionalFields');
  const hidden = fields.style.display === 'none';
  fields.style.display = hidden ? 'block' : 'none';
  document.getElementById('optionalToggleText').textContent = hidden ? '▴ 선택 정보 접기' : '▾ 선택 정보 추가하기';
}

function toggleDay(btn) {
  btn.classList.toggle('active');
  // ALL 버튼 상태 업데이트
  const allBtn = document.querySelector('.day-btn-all');
  if (allBtn) {
    const dayBtns = [...document.querySelectorAll('.day-btn:not(.day-btn-all)')];
    allBtn.classList.toggle('active', dayBtns.every(b => b.classList.contains('active')));
  }
}

function toggleAllDays(btn) {
  const isActive = btn.classList.contains('active');
  document.querySelectorAll('.day-btn:not(.day-btn-all)').forEach(b => {
    b.classList.toggle('active', !isActive);
  });
  btn.classList.toggle('active', !isActive);
}

function toggleChannel(btn) {
  btn.classList.toggle('active');
}

function toggleHoliday(row) {
  const checkbox = row.querySelector('.holiday-checkbox');
  if (checkbox) checkbox.classList.toggle('active');
}

function handleStep2Scroll() {
  const body = document.getElementById('step2Body');
  const header = document.getElementById('modalStickyHeader');
  const scrollHeader = document.getElementById('step2ScrollHeader');
  if (!body || !header || !scrollHeader) return;
  // step2ScrollHeader 하단이 스크롤 아웃되면 sticky 표시
  const threshold = scrollHeader.offsetTop + scrollHeader.offsetHeight;
  if (body.scrollTop > threshold) {
    header.classList.add('show');
  } else {
    header.classList.remove('show');
  }
}

// ===== 제보 제출 =====
function submitCampaign() {
  const channels = [...document.querySelectorAll('.channel-btn.active')].map(b => b.dataset.channel);
  const platform = document.getElementById('inputPlatform').value;
  const content = document.getElementById('inputContent').value.trim();
  const deadline = getSelectedDeadline();
  const link = '';

  const category = document.getElementById('inputCategory').value;

  let valid = true;
  if (!channels.length) { showFieldError('channel'); valid = false; }
  if (!category) { showFieldError('inputCategory'); valid = false; }
  if (!platform) { showFieldError('inputPlatform'); valid = false; }
  if (!content) { showFieldError('inputContent'); valid = false; }

  let placeId;

  if (modalIsNewPlace) {
    if (!valid) return;
    const newPlace = {
      id: nextPlaceId++,
      name: document.getElementById('inputName').value.trim(),
      address: modalSelectedAddress,
      lat: modalSelectedLat, lng: modalSelectedLng,
      category,
      founderNickname: document.getElementById('inputNickname').value.trim(),
      founderUrl: document.getElementById('inputUrl').value.trim()
    };
    places.push(newPlace);
    placeId = newPlace.id;
  } else {
    if (!valid) return;
    placeId = modalSelectedPlaceId;
    const place = places.find(p => p.id === placeId);
    if (place) place.category = category;
  }

  campaigns.push({
    id: nextCampaignId++, placeId, channels, platform, content, deadline, link,
    operatingDays: [...document.querySelectorAll('.day-btn.active')].map(b => b.textContent),
    excludeHoliday: document.getElementById('holidayExclude')?.classList.contains('active') ?? false,
    operatingHours: document.getElementById('inputHours').value.trim(),
    reporterNickname: document.getElementById('inputNickname').value.trim(),
    reporterUrl: document.getElementById('inputUrl').value.trim()
  });

  closeModal();
  renderAll();

  const place = places.find(p => p.id === placeId);
  map.setCenter(new naver.maps.LatLng(place.lat, place.lng));
  map.setZoom(16);
  showToast(`${place.name} 제보 완료!`);
}

// ===== 토스트 =====
let _toastTimer = null;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.innerHTML = msg;
  toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.classList.remove('show'); _toastTimer = null; }, 3000);
}

// ===== 네이버지도 열기 =====
function openNaverMap(name, address) {
  const webUrl = `https://map.naver.com/v5/search/${encodeURIComponent(name)}`;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    // 앱 딥링크 시도
    const appUrl = `nmap://search?query=${encodeURIComponent(name)}&appname=muhyeop-map`;
    const start = Date.now();
    window.location.href = appUrl;
    // 앱이 없으면 (300ms 내 화면 전환 없으면) 웹으로 fallback
    setTimeout(() => {
      if (Date.now() - start < 1500) {
        window.open(webUrl, '_blank', 'noopener');
      }
    }, 300);
  } else {
    window.open(webUrl, '_blank', 'noopener');
  }
}

// ===== 모바일 바텀시트 =====
function openMobileSheet(place) {
  // 검색 키패드가 떠 있으면 먼저 닫아 바텀시트가 올바른 위치에 뜨도록
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  const sheet = document.getElementById('mobileSheet');
  const overlay = document.getElementById('mobileSheetOverlay');
  const content = document.getElementById('mobileSheetContent');
  content.innerHTML = createMobileDetailContent(place);
  sheet.style.transform = '';
  sheet.classList.add('show');
  overlay.classList.add('show');
  setSelectedMarker(place.id);
  // 핀을 바텀시트 위 영역 중앙으로 이동 (시트에 가리지 않게 위로 올림)
  const proj = map.getProjection();
  if (proj) {
    const off = proj.fromCoordToOffset(new naver.maps.LatLng(place.lat, place.lng));
    off.y += 150;
    map.panTo(proj.fromOffsetToCoord(off));
  }
  // 사이드바 오프스크린으로 내리기
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.style.transition = 'transform 0.3s ease';
    sidebar.style.transform = 'translateY(100%)';
    setTimeout(() => { sidebar.style.transition = ''; }, 300);
  }
}

function closeMobileSheet() {
  const sheet = document.getElementById('mobileSheet');
  sheet.style.transform = '';
  sheet.classList.remove('show');
  document.getElementById('mobileSheetOverlay').classList.remove('show');
  clearSelectedMarker();
  // 사이드바 78px 상태로 복귀
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.style.transition = 'transform 0.3s ease';
    sidebar.style.transform = '';
    setTimeout(() => { sidebar.style.transition = ''; }, 300);
  }
}

// ===== 모집중인협찬 사이드바 스와이프 다운으로 닫기 =====
function initSidebarSwipeToDismiss() {
  const sidebar = document.getElementById('sidebar');
  const header = sidebar.querySelector('.sidebar-header');

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  function startDrag(y) {
    if (window.innerWidth > 640) return false;
    if (!sidebar.classList.contains('expanded')) return false;
    startY = y; currentY = y; dragging = true;
    sidebar.style.transition = 'none';
    return true;
  }

  function moveDrag(y) {
    if (!dragging) return;
    currentY = y;
    const delta = currentY - startY;
    if (delta < 0) return;
    sidebar.style.transform = `translateY(${delta}px)`;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    const delta = currentY - startY;
    if (delta > 80) {
      // peek(헤더 바) 상태로 복귀 — transform만 애니메이션(GPU 가속)해 부드럽게, 끝나면 height를 한 프레임에 교체
      const arrow = document.getElementById('sidebarArrow');
      if (arrow) arrow.textContent = '︿';
      setNaverLogoVisible(true);
      const PEEK_H = 78;
      const slideTo = Math.max(0, sidebar.offsetHeight - PEEK_H);
      sidebar.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      sidebar.style.transform = `translateY(${slideTo}px)`;
      setTimeout(() => {
        // 같은 화면 위치에서 height 축소 + transform 리셋을 원자적으로 교체 → 점프 없음
        sidebar.style.transition = 'none';
        sidebar.classList.remove('expanded');
        sidebar.classList.remove('expanded-full');
        sidebar.style.transform = '';
        const list = document.getElementById('campaignList');
        if (list) list.scrollTop = 0;
        requestAnimationFrame(() => { sidebar.style.transition = ''; });
      }, 300);
    } else {
      sidebar.style.transition = 'none';
      sidebar.style.transform = '';
      requestAnimationFrame(() => { sidebar.style.transition = ''; });
    }
  }

  // 헤더 영역
  header.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientY), { passive: true });
  header.addEventListener('touchmove', (e) => moveDrag(e.touches[0].clientY), { passive: true });
  header.addEventListener('touchend', endDrag);

  // 리스트 영역: 맨 위에서 아래로 당길 때만 닫기
  const list = document.getElementById('campaignList');
  list.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = false;
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    const y = e.touches[0].clientY;
    const delta = y - startY;
    // 맨 위에서 아래로 당길 때만 dismiss 처리
    if (list.scrollTop <= 0 && delta > 0 && sidebar.classList.contains('expanded')) {
      if (!dragging) {
        dragging = true;
        sidebar.style.transition = 'none';
      }
      e.preventDefault();
      currentY = y;
      sidebar.style.transform = `translateY(${delta}px)`;
    }
  }, { passive: false });
  list.addEventListener('touchend', endDrag);
}

// ===== 바텀시트 스와이프 다운으로 닫기 =====
function initSheetSwipeToDismiss() {
  const sheet = document.getElementById('mobileSheet');
  const handle = sheet.querySelector('.mobile-sheet-handle');
  const content = document.getElementById('mobileSheetContent');

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  function onTouchStart(e) {
    // 컨텐츠 스크롤 중이면 무시 (맨 위일 때만 드래그 허용)
    if (e.target.closest('.mobile-sheet-content') && content.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dragging = true;
    sheet.style.transition = 'none'; // 드래그 중 애니메이션 끔
  }

  function onTouchMove(e) {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    const delta = currentY - startY;
    if (delta < 0) return; // 위로 당기는 건 무시
    sheet.style.transform = `translateY(${delta}px)`;
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;
    const delta = currentY - startY;
    if (delta > 80) {
      sheet.style.transition = 'transform 0.3s ease';
      sheet.style.transform = 'translateY(100%)';
      // 사이드바 동시에 올라오기
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.style.transition = 'transform 0.3s ease';
        sidebar.style.transform = '';
        setTimeout(() => { sidebar.style.transition = ''; }, 300);
      }
      setTimeout(() => {
        sheet.style.transition = 'none';
        sheet.style.transform = '';
        sheet.classList.remove('show');
        document.getElementById('mobileSheetOverlay').classList.remove('show');
        requestAnimationFrame(() => { sheet.style.transition = ''; });
      }, 300);
    } else {
      sheet.style.transition = 'transform 0.25s ease';
      sheet.style.transform = '';
    }
  }

  sheet.addEventListener('touchstart', onTouchStart, { passive: true });
  sheet.addEventListener('touchmove', onTouchMove, { passive: true });
  sheet.addEventListener('touchend', onTouchEnd);
}

// 검색창 외 영역 터치 시 키보드 닫기
document.addEventListener('click', (e) => {
  const searchInput = document.getElementById('regionSearchMobileTop');
  if (searchInput && document.activeElement === searchInput) {
    if (!e.target.closest('.mobile-header-search')) {
      searchInput.blur();
    }
  }
});

// 텍스트 필드 clear 버튼 설정
function setupClearButtons() {
  // 모바일 오버레이 검색창 (flex 컨테이너 내부에 버튼 추가)
  const searchInput = document.getElementById('regionSearchMobileOverlay');
  if (searchInput) {
    const btn = createClearBtn();
    searchInput.parentElement.appendChild(btn);
    bindClearBtn(btn, searchInput);
    // 검색창 포커스 시 바텀시트 닫기
    searchInput.addEventListener('focus', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('expanded')) {
        sidebar.classList.remove('expanded', 'expanded-full');
        const arrow = document.getElementById('sidebarArrow');
        if (arrow) arrow.textContent = '︿';
        setTimeout(() => {
          const list = document.getElementById('campaignList');
          if (list) list.scrollTop = 0;
        }, 350);
      }
    });
  }

  // 모달 폼 텍스트 입력 (input-wrap으로 감싸서 절대 위치)
  document.querySelectorAll('.form-group input[type="text"], .form-group input[type="url"]').forEach(input => {
    const wrap = document.createElement('div');
    wrap.className = 'input-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = createClearBtn();
    wrap.appendChild(btn);
    bindClearBtn(btn, input);
  });
}

function createClearBtn() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-input-clear';
  btn.innerHTML = '<img src="image/ic_text_clear_20.svg" width="20" height="20" alt="지우기">';
  return btn;
}

function bindClearBtn(btn, input) {
  input.addEventListener('input', () => {
    btn.classList.toggle('show', input.value.length > 0);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // blur 방지
  btn.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
    btn.classList.remove('show');
  });
}

document.addEventListener('DOMContentLoaded', setupClearButtons);
window.addEventListener('load', function() {
  initMap();
  setTimeout(function() { window.dispatchEvent(new Event('resize')); }, 100);
});

window.addEventListener('resize', function() {
  if (openPcCardPlace && window.innerWidth > 640) {
    panToCard(openPcCardPlace);
  }
});

// ===== 커스텀 셀렉트 바텀시트 =====
let _selectSheetTarget = null;

function openSelectSheet(selectId, title) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  _selectSheetTarget = selectId;

  document.getElementById('selectSheetTitle').textContent = title;

  const list = document.getElementById('selectSheetList');
  list.innerHTML = [...sel.options].map(opt => {
    const isActive = opt.value && opt.value === sel.value;
    return `<div class="select-sheet-item${isActive ? ' active' : ''}" onclick="pickSelectItem('${selectId}', '${opt.value.replace(/'/g, "\\'")}', '${opt.textContent.replace(/'/g, "\\'")}')">
      ${opt.textContent}
    </div>`;
  }).filter((_, i) => sel.options[i].value !== '').join(''); // 빈 placeholder 제외

  document.getElementById('selectSheetOverlay').classList.add('show');
  requestAnimationFrame(() => document.getElementById('selectSheetPanel').classList.add('show'));
}

function closeSelectSheet() {
  document.getElementById('selectSheetPanel').classList.remove('show');
  setTimeout(() => document.getElementById('selectSheetOverlay').classList.remove('show'), 300);
  _selectSheetTarget = null;
}

function pickSelectItem(selectId, value, label) {
  const sel = document.getElementById(selectId);
  if (sel) sel.value = value;

  const valueEl = document.getElementById(selectId + 'Value');
  if (valueEl) {
    valueEl.textContent = label;
    valueEl.classList.add('selected');
  }

  // 오류 메시지 클리어
  if (selectId.startsWith('inputDeadline')) {
    clearFieldError('deadline');
    const y = parseInt(document.getElementById('inputDeadlineYear').value);
    const m = parseInt(document.getElementById('inputDeadlineMonth').value);
    if (selectId === 'inputDeadlineYear' || selectId === 'inputDeadlineMonth') {
      updateDayOptions(y, m);
      syncDateTriggers();
    }
  } else {
    clearFieldError(selectId);
  }

  closeSelectSheet();
  sel.dispatchEvent(new Event('change'));
}

function syncDateTriggers() {
  ['inputDeadlineYear', 'inputDeadlineMonth', 'inputDeadlineDay'].forEach(id => {
    const sel = document.getElementById(id);
    const valueEl = document.getElementById(id + 'Value');
    if (sel && valueEl && sel.value) {
      const opt = sel.options[sel.selectedIndex];
      valueEl.textContent = opt ? opt.textContent : sel.value;
      valueEl.classList.add('selected');
    }
  });
}

function syncSelectTrigger(selectId) {
  const sel = document.getElementById(selectId);
  const valueEl = document.getElementById(selectId + 'Value');
  if (!sel || !valueEl) return;
  const val = sel.value;
  if (val) {
    const opt = [...sel.options].find(o => o.value === val);
    valueEl.textContent = opt ? opt.textContent : val;
    valueEl.classList.add('selected');
  } else {
    valueEl.textContent = '선택하세요';
    valueEl.classList.remove('selected');
  }
}
