# 프론트엔드 (이용자용 지도 화면)

## 주요 파일
- `index.html` — 마크업 (지도, 모달, 사이드바, 바텀시트 등)
- `app.js` — 전체 클라이언트 로직
- `style.css` — 전체 스타일 (PC/모바일 공용, 미디어쿼리로 분기)
- `js/MarkerClustering.js` — 네이버 지도 마커 클러스터링 라이브러리

## 핵심 데이터 흐름
- `places`: 장소(매장) 목록, `campaigns`: 장소에 달린 협찬 캠페인 목록 (1:N)
- 캠페인에는 `deadline`(마감일, 빈 값 허용 = 마감일 없음), `createdAt`, `source`(`user`/그 외) 등이 있음
- 지도에 마커를 찍고, 마커 클릭 시 정보창(인포윈도우)에 협찬 내용을 보여줌

## 사이드바 "모집 중인 협찬" 정렬
- **등록순(최근 등록이 위)** 으로 정렬. 장소별 `getActiveCampaigns(p.id)`의 `createdAt` 중 최댓값을 구해 내림차순.
- 과거에는 마감일(`earliestDeadlineUTC`) 기준이었으나 D-day/마감 시스템 제거 후 등록순으로 변경됨.

## PC 모달 모드 클래스
- `body.pc-report-mode`, `body.pc-reportissue-mode`: PC 사이드패널에서 보여지는 신고하기/제보하기 폼에 적용되는 오버라이드 클래스. Figma PC 디자인과 입력 높이(48px)/폰트(16px)/textarea(120px)/버튼(56px·18px) 등을 맞춰둠.

## 검색 결과 리스트 (신고하기 `#reportResultsList`, 제보하기 `#placeResultsList`)
- 공통 클래스 `.place-results-list`로 간격 규칙 통일: 비어있으면 숨김, 내용 있으면 위에 8px 간격.
- 신고하기(`renderReportResults()`)는 항목을 선택하면 리스트가 **선택된 1개만** 남도록 축약됨 (스크롤 불편 해소 목적). 다시 선택 해제하면 전체 리스트 복원.

## 실시간 제보 알림 캐릭터/말풍선 (`#liveBubble`, `.live-character-wrap`)
- 지도 우측 하단에 떠서 최근 등록된 매장을 랜덤 메시지 풀에서 순환 노출 (`showLiveBubble()`)
- 메시지 풀은 `withPlace()`로 캠페인에 `placeId`를 매핑해 구성
- 말풍선을 클릭하면 `clickLiveBubble()` → `focusPlace(placeId)`로 해당 매장 핀으로 이동 + 팝업/시트 오픈
- 부모 `.live-alert`가 `pointer-events: none`이라 클릭 가능하게 하려면 `.live-bubble.show`에 `pointer-events: auto`를 개별 지정해야 함 (캐릭터 래퍼도 동일 패턴)

## 정보창(인포윈도우) 뱃지
- "공휴일 불가" 뱃지: `excludeHoliday`가 true일 때 노출, 폰트 컬러 `#000`
