# 어드민

## 주요 파일
- `admin.html` — 어드민 마크업 (대시보드, 장소/캠페인 관리, Excel 업로드 가이드 등)
- `admin.js` — 어드민 로직
- `admin.css` — 어드민 전용 스타일

## 날짜/시간 표시 (KST 변환)
- DB의 `created_at`은 `datetime('now')`로 **UTC 저장**(스키마 대부분. `scraped_items`만 `+9 hours`). 어드민 목록의 **일시 표시는 `fmtKST()`로 KST 변환** 후 출력(회원목록 가입일시 `u.createdAt`, 신고목록 신고일시 `r.createdAt`). `fmtKST`는 SQLite UTC 문자열을 `Asia/Seoul` 기준 `YYYY-MM-DD HH:MM`으로. 대시보드 "오늘 가입" 집계(`isCreatedToday`)도 KST 기준. (후기 목록의 게시일은 `postDate` 날짜값이라 변환 대상 아님)

## 대시보드 통계
- `statPlaces`(장소 수), `statCampaigns`(전체 캠페인 수), `statActive`(마감일이 오늘 이후인 캠페인 수), `statUserReported`(사용자 제보 수), `statMembers`(가입 회원 수, `/api/users` 응답 길이) 카드로 구성
- **방문 카드**(2026-07-31): `statVisitTodayPv`(오늘 PV)·`statVisitTodayUv`(오늘 UV=IP+일 중복제거)·`statVisitTotalPv`(누적 PV). `GET /api/places?visit=stats`로 조회(비로그인 포함 전체 방문). 집계는 공개 페이지 로드 시 `POST ?visit=1`(app.js). 기존 회원목록 "접속수"는 로그인 회원 한정이라 별개.
- **유입경로 카드**(`#referrerStats`, `renderReferrers`): `?visit=stats`의 `referrers`(누적 top8)로 채널별(네이버/인스타/구글/당근/직접·앱/기타 호스트) 막대 표시. 방문 핑에 `document.referrer`를 실어 보내 `site_referrer`에 채널 분류(`classifyReferrer`) 누적. 내부이동(muhyeop.com)은 제외, referrer 빈 값(다이렉트·앱·일부 인앱브라우저)은 '직접·앱'. 검색어까진 안 보임.
- **방문 추이 그래프**(`#visitChart`, `renderVisitChart`): 순수 CSS 막대그래프(차트 라이브러리 없음). **일별/주별/월별 토글**(`setVisitPeriod`) — `?visit=stats&period=day|week|month`. PV=SUM, UV는 기간 내 **진짜 고유**(`COUNT(DISTINCT visitor_key)` from `site_visitor`)라 일별 UV 단순합보다 정확. PV 막대 안에 UV를 브랜드컬러로 채워 비중 표시. day=최근 14일, week/month=최근 12구간.
- **마감 임박 카드**(`#ddayStats`, 2026-07-31): 활성 캠페인을 마감까지 남은 일수별로 **D-DAY(오늘 마감)~D-7** 8칸으로 집계 표시(2026-08-02 D-4→D-7 확장). `deadlineToUTC(c.deadline) - today === n*86400000`(KST 기준), 상시(마감일 빈 값=Infinity)는 제외. D-DAY 칸은 브랜드컬러 강조. 체험단 마감이 ~5일이라 매일 얼마나 갱신해야 하는지 파악용.
- "마감 완료" 통계 카드는 D-day/마감 시스템 제거 후 함께 삭제됨 (`expired` 필터, `statExpired` 더 이상 없음)

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
- **수집**: 플랫폼(디너의여왕/포블로그)·지역·범위·최대건수 선택 후 `collectScrape()`(`POST ?action=scrape`). 결과가 `scraped_items`(승인 대기)에 쌓임. 승인 대기/등록 완료/반려/수집 이력 서브탭.
- **승인 대기 검수**: 행별 [승인][수정(인라인)][반려], 일괄 반려. `approveStaged`가 매장 없으면 좌표변환 후 `POST /api/places`(**`source:'admin'` 전송 → 최초 제보자에 운영자 세션 안 붙음**, 2026-08-23 수정)+`POST /api/campaigns`(`source:'admin'`)→`review` status=registered. 검수(`auto_note`)열에 오토파일럿 라우팅 사유 표시.
- **중복 매장 방지**(2026-08-27): 디너의여왕은 채널(블로그/클립/인스타)마다 별도 캠페인이라 **한 매장이 여러 행으로 승인**됨. `POST /api/places`(`source:'admin'`)와 `_autopilot.insertPlace`는 **같은 이름(공백무시)+같은 좌표(±0.0007≈50m) 매장이 있으면 새로 안 만들고 그 매장 재사용** → 매장 1개·캠페인만 여러 개. (이전엔 빠른 연속 승인 시 클라 메모리 dedup 경합으로 같은 매장 2~3개 생성되던 버그. 기존 57개는 병합 정리함)
- **AI 자동등록(오토파일럿) 카드**(2026-08): `execAutopilot(dry)` — [미리보기(등록 안 함, `?dry=1`)]/[지금 실행](`POST ?action=autopilot`). 결정 표(🟢자동등록/🟡검수대기/🔴스킵)+요약 노출. **매일 06:00 KST 크론 자동 실행**되며 버튼은 즉시 실행/미리보기용. 자동등록분은 `campaigns.source='ai'` → **조회>캠페인 출처 라디오 'AI'**로 모아보고 해당 행에서 회수. 라우팅/처리량 상세: `docs/product/03-platform-analysis.md` 8절, 엔진 `api/_autopilot.js`.

## 회원 목록 (`tab-users`)
- `api/users.js`(`GET`만 지원)로 `users` 테이블 전체를 가입일 역순 조회. ID/로그인 방식/닉네임/이메일/블로그·인스타/가입일시 표시
- 이메일은 로그인 사용자만 OAuth로 자동 수집되며(비로그인 사용자는 이메일을 수집하지 않음), 블로그·인스타는 사용자가 프로필 설정에서 등록한 경우에만 채워짐
