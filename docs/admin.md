# 어드민

## 주요 파일
- `admin.html` — 어드민 마크업 (대시보드, 장소/캠페인 관리, Excel 업로드 가이드 등)
- `admin.js` — 어드민 로직
- `admin.css` — 어드민 전용 스타일

## 대시보드 통계
- `statPlaces`(장소 수), `statCampaigns`(전체 캠페인 수), `statActive`(마감일이 오늘 이후인 캠페인 수), `statUserReported`(사용자 제보 수), `statMembers`(가입 회원 수, `/api/users` 응답 길이) 카드로 구성
- "마감 완료" 통계 카드는 D-day/마감 시스템 제거 후 함께 삭제됨 (`expired` 필터, `statExpired` 더 이상 없음)

## Excel 업로드
- 장소/캠페인 일괄 등록 시 사용. 마감일 컬럼은 `YYYY-MM-DD` 형식이며 **비워두면 마감일 없이 등록**됨 (가이드 문구에 명시되어 있음)

## 신고(`reports`) 처리
- 신고 목록 화면은 Figma 리스킨 적용: 흰 카드(`.result-card`) + 컨트롤바(`전체 N건 중 N건 표시`). 컬럼은 ID/매장명/**플랫폼**/캠페인명/신고이유/상세내용/신고자/신고일시/관리 (플랫폼은 `reports` API가 조인한 `c.platform`).
- 관리 버튼은 신고 사유별 분기에서 **고정 3종으로 단순화**됨 (`reportActionButtons`):
  - **수정** = 신고된 캠페인 내용 직접 수정 (`editCampaign(campaignId)`, 신고기록은 안 지움)
  - **숨김↔노출** = 해당 캠페인 공개 숨김 토글 (`toggleCampaignHidden`, `PATCH /api/campaigns?id=` 바디 `{hidden}` — 전역 `campaigns`(app.js 로드)에서 현재 hidden 상태 조회해 라벨 결정)
  - **삭제** = 이 신고 기록만 삭제 (`dismissReport` → `DELETE /api/reports?id=`, 레드)
- `api/reports.js`의 `DELETE`는 신고 항목을 완전히 삭제하는 단일 동작만 지원 (`hide=true` 같은 별도 분기는 사용처가 없어 제거됨)
- 신고 목록의 "신고자" 컬럼은 로그인 사용자가 신고한 경우 닉네임을, 비로그인 신고는 "비회원"을 표시 (`reports.user_id` LEFT JOIN `users`)

## 매장/캠페인 등록 폼
- 캠페인 등록 폼의 "참여 가능 요일"은 기본 전체 ON. **`참여 가능 요일 확인 안됨`(`#addDaysUnknown`) 체크 시 요일 전체 해제 + 비활성** → 저장 시 빈 값이라 공개 화면에 요일 미노출(`toggleDaysUnknown`). 캠페인 수정 진입 시 요일이 비어있으면 이 체크박스가 자동 체크됨. 어드민은 마감일이 **선택(현행 유지)**, 공개 제보 폼은 필수화 방향(논의됨).

## 회원 목록 (`tab-users`)
- `api/users.js`(`GET`만 지원)로 `users` 테이블 전체를 가입일 역순 조회. ID/로그인 방식/닉네임/이메일/블로그·인스타/가입일시 표시
- 이메일은 로그인 사용자만 OAuth로 자동 수집되며(비로그인 사용자는 이메일을 수집하지 않음), 블로그·인스타는 사용자가 프로필 설정에서 등록한 경우에만 채워짐
