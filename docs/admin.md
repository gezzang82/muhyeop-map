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
- `api/reports.js`의 `DELETE`는 신고 항목을 완전히 삭제하는 단일 동작만 지원 (`hide=true` 같은 별도 분기는 사용처가 없어 제거됨)
- 신고 목록의 "신고자" 컬럼은 로그인 사용자가 신고한 경우 닉네임을, 비로그인 신고는 "비회원"을 표시 (`reports.user_id` LEFT JOIN `users`)

## 회원 목록 (`tab-users`)
- `api/users.js`(`GET`만 지원)로 `users` 테이블 전체를 가입일 역순 조회. ID/로그인 방식/닉네임/이메일/블로그·인스타/가입일시 표시
- 이메일은 로그인 사용자만 OAuth로 자동 수집되며(비로그인 사용자는 이메일을 수집하지 않음), 블로그·인스타는 사용자가 프로필 설정에서 등록한 경우에만 채워짐
