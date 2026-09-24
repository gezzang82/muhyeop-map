# 어드민

## 주요 파일
- `admin.html` — 어드민 마크업 (대시보드, 장소/캠페인 관리, Excel 업로드 가이드 등)
- `admin.js` — 어드민 로직
- `admin.css` — 어드민 전용 스타일

## 모바일 반응형 (로그인 + 대시보드만, 2026-09-18)
- 어드민은 기본 PC 전용이나 **로그인 화면과 대시보드만** 폰에서 보이게 `admin.css`에 `@media (max-width:640px)` 블록 추가. 좌측 사이드바 숨김, 상단바에 `.topbar-brand-mobile`('무협맵 관리자') 노출, 통계 그리드 2열(값 26px/라벨 13.5px), 대시보드 행 1열, 마감임박/방문추이 등 넓은 카드는 `overflow-x:auto`. 로그인 박스도 반응형. 폰트는 너무 작지 않게. **나머지 관리 탭(장소/캠페인/수집 등)은 PC에서 사용**(모바일 미대응).
- **가로 스크롤/바운스 수정(2026-09-23)**: `.admin-content`가 `overflow-y:auto`라 가로축이 `auto`로 계산돼, 넓은 카드/차트가 조금만 넘쳐도 페이지 전체가 좌우로 밀리던 문제 → 모바일에서 `.admin-content { overflow-x: hidden }`(넓은 차트는 자체 `overflow-x:auto`로 내부 스크롤 유지, 관리탭 표는 `display:block`+`overflow-x:auto`). 당길 때 밀리는 오버스크롤 바운스는 `overscroll-behavior:none`(html/body/.admin-content)로 차단.

## 날짜/시간 표시 (KST 변환)
- DB의 `created_at`은 `datetime('now')`로 **UTC 저장**(스키마 대부분. `scraped_items`만 `+9 hours`). 어드민 목록의 **일시 표시는 `fmtKST()`로 KST 변환** 후 출력(회원목록 가입일시 `u.createdAt`, 신고목록 신고일시 `r.createdAt`). `fmtKST`는 SQLite UTC 문자열을 `Asia/Seoul` 기준 `YYYY-MM-DD HH:MM`으로. 대시보드 "오늘 가입" 집계(`isCreatedToday`)도 KST 기준. (후기 목록의 게시일은 `postDate` 날짜값이라 변환 대상 아님)

## 대시보드 통계
- `statPlaces`(장소 수), `statCampaigns`(전체 캠페인 수), `statActive`(마감일이 오늘 이후인 캠페인 수), `statReviewTotal`/`statReviewToday`(후기 전체/오늘, KST), `statMembers`(가입 회원 수, `/api/users` 응답 길이) 카드로 구성
- **'유저 제보' 카드 → '후기' 카드 교체(2026-09-20)**: 예전엔 `statUserReported`(사용자 제보 수/오늘)를 표시했는데 유저 제보 지표 중요도가 낮아지고 후기(공생 활동)가 더 의미 있어 → `statReviewTotal`/`statReviewToday`로 교체. 값은 `?stats=1`의 `reviewCount`/`reviewTodayCount`(`reviews` 테이블, [[api-db]]).
- **방문 카드**(2026-07-31): `statVisitTodayPv`(오늘 PV)·`statVisitTodayUv`(오늘 UV=IP+일 중복제거)·`statVisitTotalPv`(누적 PV). `GET /api/places?visit=stats`로 조회(비로그인 포함 전체 방문). 집계는 공개 페이지 로드 시 `POST ?visit=1`(app.js). 기존 회원목록 "접속수"는 로그인 회원 한정이라 별개. **오늘 평균 체류시간 카드**(`statVisitTodayDwell`, `fmtDwell`, 2026-09-09): `dwell_sum/dwell_count`. **당일 재방문 회원 카드**(`statVisitTodayMember`, 2026-09-25): 오늘(KST) 방문한 **기존 회원 수(당일 가입자 제외)** = `?visit=stats`의 `todayMemberReturning`(`user_visits.visit_date=오늘 AND date(users.created_at,'+9h')<>오늘` 조인 집계). 방문 집계(PV/UV)와 달리 **로그인 회원의 재방문**만 봄(신규 유입 아닌 리텐션 지표). **운영자 집 IP는 방문 집계에서 제외**(`EXCLUDED_VISIT_IPS`, api/places.js — 기본 집IP + 환경변수 추가)라 자기 접속이 PV/UV/체류를 부풀리지 않음. 방문추이 그래프 툴팁에도 일별 평균 체류 표시.
- **유입경로 카드(누적)**(`#referrerStats`, `renderReferrers`): `?visit=stats`의 `referrers`(누적 top8, `site_referrer`)로 채널별(네이버/인스타/구글/당근/직접·앱/기타 호스트) 막대 표시. 방문 핑에 `document.referrer`를 실어 보내 채널 분류(`classifyReferrer`) 누적. 내부이동(muhyeop.com)은 제외, referrer 빈 값(다이렉트·앱·일부 인앱브라우저)은 '직접·앱'. 검색어까진 안 보임.
- **일별 유입경로 카드**(`#referrerDaily`, `renderReferrerDaily`, 2026-09-09): 최근 14일 **날짜별 채널 분포**(예 "09-09 · 직접·앱 6 · 네이버 3", 외부채널은 브랜드컬러 칩). `?visit=stats`의 `referrerDaily`(날짜×채널 매트릭스)로 렌더. 별도 `site_referrer_daily` 테이블에 `?visit=1`이 일자별 누적. **블로그·카톡 등 채널 효과를 "올린 날 대비 유입"으로 측정**하려고 신설(누적 카드만으론 "오늘 어디서 왔나"를 못 봤음). 배포(2026-09-09) 이후 방문부터 집계.
- **방문 추이 그래프**(`#visitChart`, `renderVisitChart`): 순수 CSS 막대그래프(차트 라이브러리 없음). **일별/주별/월별 토글**(`setVisitPeriod`) — `?visit=stats&period=day|week|month`. PV=SUM, UV는 기간 내 **진짜 고유**(`COUNT(DISTINCT visitor_key)` from `site_visitor`)라 일별 UV 단순합보다 정확. PV 막대 안에 UV를 브랜드컬러로 채워 비중 표시. day=최근 14일, week/month=최근 12구간.
- **마감 임박 카드**(`#ddayStats`, 2026-07-31): 활성 캠페인을 마감까지 남은 일수별로 **D-DAY(오늘 마감)~D-7** 8칸으로 집계 표시(2026-08-02 D-4→D-7 확장). `deadlineToUTC(c.deadline) - today === n*86400000`(KST 기준), 상시(마감일 빈 값=Infinity)는 제외. D-DAY 칸은 브랜드컬러 강조. 체험단 마감이 ~5일이라 매일 얼마나 갱신해야 하는지 파악용.
- "마감 완료" 통계 카드는 D-day/마감 시스템 제거 후 함께 삭제됨 (`expired` 필터, `statExpired` 더 이상 없음)
- **캠페인 조회·클릭 카드**(`renderCampaignClicks`, `GET /api/campaigns?clickstats=1`): `campaign_events`(view=상세보기 / click=페이지이동) 집계를 **일별**(`#campaignClickDaily`)·**지역별**(`#campaignClickRegion`)·**카테고리별**(`#campaignClickCategory`)로 표시(전환율=click/view). **플랫폼별 카드 추가(2026-09-23)**: `#campaignClickPlatform` — `?clickstats=1`의 `platforms`(리뷰노트·디너의여왕 등 플랫폼별 상세보기/페이지이동, **오늘+누적**, [[api-db]]).

## 이벤트 푸시 (전체 발송, 2026-09-23)
- 대시보드 상단 **"📣 이벤트 푸시"** 카드(`sendEventPush`): 제목/내용/(선택)이동대상(매장ID 숫자 또는 `https://` 링크) → 확인창 후 **`POST /api/users?push=broadcast`**(requireAdmin, 활성 `push_tokens` 전체에 FCM 발송, 무효 토큰 자동 비활성화). 대상 기기수는 **`GET /api/users?push=count`**(활성 토큰 수)로 카드에 표시.
- 탭 동작: `placeId`면 매장 상세(`focusPlace`), `url`이면 외부링크(`openExternal`), 없으면 앱만 열림([[frontend]] applyPushNav).
- **대상 구분**: 이벤트 푸시(브로드캐스트)는 알림 켠 기기 **전부**, 하루요약(`notifyDailyDigest`)은 **관심지역 저장(`push_prefs`)한 기기만**. 상세 [[api-db]]·`docs/product/16-push-notifications.md`.

## 이벤트 팝업(배너) 순서 (2026-09-24)
- 이벤트 팝업 탭 목록은 **노출 순서(`sort_order` 오름차순)** 로 정렬 표시(`renderBannerList`). 행 관리에 **▲▼ 이동 버튼**(`moveBanner`): 인접 배너와 위치를 바꾸고 전체 순서를 0..N-1로 정규화 → 바뀐 배너만 `PATCH /api/banners?id=`(`{sortOrder}`), 즉시 낙관적 반영. 맨 위/아래는 비활성. 새 배너는 자동으로 맨 뒤.
- 공개 앱은 **활성 배너 전체**를 이 순서대로 메인 캐러셀(우상단 점)로 노출([[frontend]] 이벤트 팝업, [[api-db]] `sort_order`).

## Excel 업로드
- 장소/캠페인 일괄 등록 시 사용. 마감일 컬럼은 `YYYY-MM-DD` 형식이며 **비워두면 마감일 없이 등록**됨 (가이드 문구에 명시되어 있음)

## 신고(`reports`) 처리
- **신고 대상 3종화(2026-07-02)**: 매장/캠페인/후기. 컬럼은 ID/**유형**/매장명/플랫폼/**대상**/신고이유/상세내용/신고자/신고일시/관리. 유형=배지(캠페인/후기/매장), 대상=캠페인 content·후기 title·매장 '-'.
- 관리 버튼은 **대상 유형별 분기** (`reportActionButtons`):
  - 캠페인: **수정**(`editCampaign`)/**숨김↔노출**(`toggleCampaignHidden`)/**삭제**(신고기록)
  - 후기: **후기 숨김**(`hideReviewFromReport` → `PATCH /api/places?reviews=&id=` `{hidden:true}`)/**삭제**(신고기록). 전체 노출/삭제는 '후기 관리' 탭
  - 매장: **매장 숨김**(`togglePlaceHidden`)/**삭제**(신고기록)
  - 공통 **삭제** = 이 신고 기록만 삭제 (`dismissReport` → `DELETE /api/reports?id=`, 레드)
- `api/reports.js`의 `DELETE`는 신고 항목을 완전히 삭제하는 단일 동작만 지원 (`hide=true` 같은 별도 분기는 사용처가 없어 제거됨)
- 신고 목록의 "신고자" 컬럼은 로그인 사용자가 신고한 경우 닉네임을, 비로그인 신고는 "비회원"을 표시 (`reports.user_id` LEFT JOIN `users`)

## 매장/캠페인 등록 폼
- **직전 캠페인 프리필**(2026-07-31): 매장 콤보에서 **기존 매장을 직접 고르면**(`pickExistingPlaceForNew`) 그 매장의 **가장 최근 캠페인 값**(플랫폼/채널/내용/운영시간/요일/공휴일)을 폼에 자동 채움 — **마감일과 협찬 링크(URL)는 캠페인마다 달라 프리필 안 함**(둘 다 매번 새로 입력)(`prefillCampaignFromLast`). 체험단 마감이 ~5일이라 같은 매장을 반복 등록하는 일상 작업을 단축. `editCampaign`은 `pickExistingPlace`를 직접 호출하므로 프리필 대상 아님(수정은 해당 캠페인 값으로 채움).
- 캠페인 등록 폼의 "참여 가능 요일"은 기본 전체 ON. **`참여 가능 요일 확인 안됨`(`#addDaysUnknown`) 체크 시 요일 전체 해제 + 비활성** → 저장 시 빈 값이라 공개 화면에 요일 미노출(`toggleDaysUnknown`). 캠페인 수정 진입 시 요일이 비어있으면 이 체크박스가 자동 체크됨. 어드민은 마감일이 **선택(현행 유지)**, 공개 제보 폼은 필수화 방향(논의됨).

## 데이터 수집 / AI 자동등록 (매장/캠페인 등록 → 데이터 수집 서브탭)
- **수집**: 플랫폼(디너의여왕/강남맛집/링블/서울오빠/포블로그/오마이블로그/구구다스/리뷰노트/라미라미/레뷰/포포몬)·지역·범위·최대건수 선택 후 `collectScrape()`(`POST ?action=scrape`). 결과가 `scraped_items`(승인 대기)에 쌓임. 승인 대기/등록 완료/반려/수집 이력 서브탭. 수집/조회/등록 폼의 플랫폼 드롭다운(`#cvPlatform`/`#addPlatform`/`#inputPlatform` 등)에 **레뷰·포포몬**도 포함(2026-09-19~20).
- **승인 대기 검수**: 행별 [승인][수정(인라인)][반려], 일괄 반려. `approveStaged`가 매장 없으면 좌표변환 후 `POST /api/places`(**`source:'admin'` 전송 → 최초 제보자에 운영자 세션 안 붙음**, 2026-08-23 수정)+`POST /api/campaigns`(`source:'admin'`)→`review` status=registered. 검수(`auto_note`)열에 오토파일럿 라우팅 사유 표시.
- **중복 매장 방지**(2026-08-27): 디너의여왕은 채널(블로그/클립/인스타)마다 별도 캠페인이라 **한 매장이 여러 행으로 승인**됨. `POST /api/places`(`source:'admin'`)와 `_autopilot.insertPlace`는 **같은 이름(공백무시)+같은 좌표(±0.0007≈50m) 매장이 있으면 새로 안 만들고 그 매장 재사용** → 매장 1개·캠페인만 여러 개. (이전엔 빠른 연속 승인 시 클라 메모리 dedup 경합으로 같은 매장 2~3개 생성되던 버그. 기존 57개는 병합 정리함)
- **AI 자동등록(오토파일럿) 카드**(2026-08): `execAutopilot(dry)` — [미리보기(등록 안 함, `?dry=1`)]/[지금 실행](`POST ?action=autopilot`). 결정 표(🟢자동등록/🟡검수대기/🔴스킵)+요약 노출. **로컬 크롤러(`scripts/crawl-worker.js`)가 상시 자동 실행**하며(Vercel 크론 폐지 2026-08-30) 버튼은 즉시 실행/미리보기용. 자동등록분은 `campaigns.source='ai'` → **조회>캠페인 출처 라디오 'AI'**로 모아보고 해당 행에서 회수. 라우팅/처리량 상세: `docs/product/03-platform-analysis.md` 8절, 엔진 `api/_autopilot.js`.

## 회원 목록 (`tab-users`)
- `api/users.js` GET으로 `users` 테이블 전체를 가입일 역순 조회. ID/로그인 방식/닉네임/이메일/블로그·인스타/제보수/후기수/접속수/최종접속/가입일시/**가입경로** 표시. (POST `?push=` 분기는 별개 — [[api-db]])
- 이메일은 로그인 사용자만 OAuth로 자동 수집되며(비로그인 사용자는 이메일을 수집하지 않음), 블로그·인스타는 사용자가 프로필 설정에서 등록한 경우에만 채워짐
- **가입경로 컬럼(2026-09-23)**: `signupSource`(`users.signup_source`)를 `SIGNUP_SRC_LABELS`(네이버/카카오/스레드/앱 등)로 표시, 빈값은 '-'. 신규 가입 시점의 유입소스를 기록(추적 흐름 [[api-db]] `api/auth/`). **소급 불가** — 배포(2026-09-23) 이후 신규 가입부터.
