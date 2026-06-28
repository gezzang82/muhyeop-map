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
- **활성 캠페인 캐시**: `getActiveCampaigns(placeId)`/`hasActiveCampaign`는 매 호출 `campaigns` 전체를 필터링하지 않고, `getActiveByPlaceMap()`가 만든 `placeId→활성캠페인[]` 맵을 재사용(지도 이동마다 O(매장×캠페인) 반복 스캔 제거). 캐시는 **명시적으로만 무효화**(`invalidateActiveCache()`): 데이터 로드 후, 제보 등록(`campaigns.push`) 후, 채널필터 변경(`filterChannel`) 시. `campaigns`를 직접 건드리면 이 무효화를 같이 호출해야 함. PC "총 협찬수"(`updateStatCount`)도 마감/숨김 제외한 활성만 집계.

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
- 메시지 풀은 `withPlace()`로 캠페인에 `placeId`를 매핑해 구성. **마감 지난 캠페인은 풀에서 제외**(`isLive` = `!hidden && deadlineToUTC(deadline) >= 오늘`, 빈 마감일=상시는 포함) — 말풍선이 끝난 협찬을 신규처럼 소개하던 버그 수정
- 말풍선을 클릭하면 `clickLiveBubble()` → `focusPlace(placeId)`로 해당 매장 핀으로 이동 + 팝업/시트 오픈
- 부모 `.live-alert`가 `pointer-events: none`이라 클릭 가능하게 하려면 `.live-bubble.show`에 `pointer-events: auto`를 개별 지정해야 함 (캐릭터 래퍼도 동일 패턴)

## 정보창(인포윈도우) 뱃지
- "공휴일 불가" 뱃지: `excludeHoliday`가 true일 때 노출, 폰트 컬러 `#000`

## 제보하기(캠페인 등록) 폼의 닉네임/링크 — 이메일 입력 없음
- `#modalOverlay` 제보 폼에는 이메일 입력란이 없음(완전히 삭제됨, 숨김 아님). 로그인 사용자는 세션의 OAuth 이메일이 서버에서 조용히 `founder_email`/`reporter_email`에 채워지고, 비로그인 사용자는 이메일을 전혀 수집하지 않음(닉네임 + 블로그/인스타 링크만).
- 로그인 상태에서 `resetModal()`은 `inputNickname`을 계정 닉네임으로 채우고 `readOnly`로 잠금. 프로필에 블로그/인스타(`currentUser.urlPlatform`/`urlId`)가 미리 등록돼 있으면 `inputUrlPlatformTrigger`에 `.locked` 클래스를 추가하고 `inputUrlId`도 `readOnly`로 잠가 수정 불가능하게 함 — 변경하려면 `#inputLockedHint` 안내 문구의 링크로 프로필 설정(`openProfileSheet()`)으로 이동해야 함.
- 프로필에 링크를 등록하지 않은 로그인 사용자나 비로그인 사용자는 평소처럼 직접 입력 가능(잠금 없음).

## 매장명 클릭 → 네이버지도 연결
- 인포윈도우(`.iw-name-link`)·모바일 상세시트(`.detail-name-link`)의 **매장명을 클릭하면 네이버지도로 이동**(`openNaverMapByPlace(placeId)` → `openNaverMap`). 매장명 옆에 `image/ic_link_16.svg`(외부링크 아이콘, 16px, 이름과 6px 간격) 표시.
- 검색어는 **매장명만** 사용(주소를 붙이면 지번/건물/호수 토큰까지 매칭하려다 네이버 장소검색 결과 0건 나는 케이스가 있어서). 매장명에 지점명이 포함돼 특정도 충분.
- 모바일은 앱 딥링크 `nmap://place?lat&lng&name`(좌표 기반 정확 위치), 앱 없으면 `map.naver.com/p/search/{매장명}` 웹으로 폴백. PC는 웹으로.

## 가입 후 SNS 등록 안내 — 1회만 노출
- 카카오/네이버 신규 가입(OAuth 콜백이 `?signup=1` 부여) 시 `openSignupInfoSheet()`로 SNS 링크 등록 안내. **한 번 노출하면 `localStorage.snsRegisterPrompted='1'`로 기록해 다시 자동 노출하지 않음**(건너뛰면 '내 정보'에서 직접 등록). load 핸들러는 `signup=1` + 실제 SNS 미등록(`currentUser` 있고 `urlPlatform/urlId` 없음) + 미노출일 때만 띄움 — 모바일 탭 폐기 후 복원으로 `signup=1`이 살아나도 중복 노출 안 됨. 제보 완료 후 SNS 권유(`maybePromptSnsRegister`)도 같은 플래그로 차단.

## 제보왕(리더보드) 배너 — 현재 숨김
- `app.js`의 `LEADERBOARD_ENABLED = false` 플래그로 PC/모바일 제보왕 배너 비노출(`renderLeaderboard`가 조기 반환, 60초 폴링도 안 돎). 베타 이벤트 시작 시 `true`로. API(`/api/users?leaderboard=1`)는 살아있음.

## 전역 텍스트/이미지 드래그 방지 (앱 느낌)
- `body`에 `user-select: none` + `-webkit-touch-callout: none`, `img/a`에 `user-drag: none`. `dragstart`/`contextmenu`를 전역 차단(길게누름·우클릭 메뉴 방지). **입력 요소(`input/textarea/[contenteditable]/select`)는 예외로 선택·붙여넣기·우클릭 허용**. 지도 패닝(네이버 자체 핸들러)·바텀시트 스와이프는 영향 없음. → "왜 텍스트 선택이 안 되지"는 의도된 동작.
