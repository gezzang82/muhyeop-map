# 어드민

## 주요 파일
- `admin.html` — 어드민 마크업 (대시보드, 장소/캠페인 관리, Excel 업로드 가이드 등)
- `admin.js` — 어드민 로직
- `admin.css` — 어드민 전용 스타일

## 날짜/시간 표시 (KST 변환)
- DB의 `created_at`은 `datetime('now')`로 **UTC 저장**(스키마 대부분. `scraped_items`만 `+9 hours`). 어드민 목록의 **일시 표시는 `fmtKST()`로 KST 변환** 후 출력(회원목록 가입일시 `u.createdAt`, 신고목록 신고일시 `r.createdAt`). `fmtKST`는 SQLite UTC 문자열을 `Asia/Seoul` 기준 `YYYY-MM-DD HH:MM`으로. 대시보드 "오늘 가입" 집계(`isCreatedToday`)도 KST 기준. (후기 목록의 게시일은 `postDate` 날짜값이라 변환 대상 아님)

## 대시보드 통계
- `statPlaces`(장소 수), `statCampaigns`(전체 캠페인 수), `statActive`(마감일이 오늘 이후인 캠페인 수), `statUserReported`(사용자 제보 수), `statMembers`(가입 회원 수, `/api/users` 응답 길이) 카드로 구성
- **마감 임박 카드**(`#ddayStats`, 2026-07-31): 활성 캠페인을 마감까지 남은 일수별로 **D-DAY(오늘 마감)~D-4** 5칸으로 집계 표시. `deadlineToUTC(c.deadline) - today === n*86400000`(KST 기준), 상시(마감일 빈 값=Infinity)는 제외. D-DAY 칸은 브랜드컬러 강조. 체험단 마감이 ~5일이라 매일 얼마나 갱신해야 하는지 파악용.
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

## 회원 목록 (`tab-users`)
- `api/users.js`(`GET`만 지원)로 `users` 테이블 전체를 가입일 역순 조회. ID/로그인 방식/닉네임/이메일/블로그·인스타/가입일시 표시
- 이메일은 로그인 사용자만 OAuth로 자동 수집되며(비로그인 사용자는 이메일을 수집하지 않음), 블로그·인스타는 사용자가 프로필 설정에서 등록한 경우에만 채워짐
