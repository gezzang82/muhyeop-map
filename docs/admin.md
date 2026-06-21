# 어드민

## 주요 파일
- `admin.html` — 어드민 마크업 (대시보드, 장소/캠페인 관리, Excel 업로드 가이드 등)
- `admin.js` — 어드민 로직
- `admin.css` — 어드민 전용 스타일

## 대시보드 통계
- `statPlaces`(장소 수), `statCampaigns`(전체 캠페인 수), `statActive`(마감일이 오늘 이후인 캠페인 수), `statUserReported`(사용자 제보 수) 카드로 구성
- "마감 완료" 통계 카드는 D-day/마감 시스템 제거 후 함께 삭제됨 (`expired` 필터, `statExpired` 더 이상 없음)

## Excel 업로드
- 장소/캠페인 일괄 등록 시 사용. 마감일 컬럼은 `YYYY-MM-DD` 형식이며 **비워두면 마감일 없이 등록**됨 (가이드 문구에 명시되어 있음)

## 신고(`reports`) 처리
- `api/reports.js`의 `DELETE`는 신고 항목을 완전히 삭제하는 단일 동작만 지원 (`hide=true` 같은 별도 분기는 사용처가 없어 제거됨)
