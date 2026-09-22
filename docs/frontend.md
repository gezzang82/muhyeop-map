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
  - **자정 롤오버 수정(2026-09-19)**: 활성 판정은 KST '오늘' 기준인데, 앱을 켜둔 채 자정을 넘기면 캐시가 어제 기준으로 굳어 **어제 마감된 캠페인이 계속 활성으로 뜨던** 문제. `getActiveByPlaceMap`이 KST 날짜 스탬프(`_activeByPlaceDay`)를 들고 있다가 날짜가 바뀌면 맵을 자동 재계산하고, `visibilitychange`로 화면 복귀 시에도 `invalidateActiveCache`+재렌더 → 날짜 경계에서 목록/핀이 갱신됨.
  - **⚠️ 성능(2026-09-14)**: `hasActiveCampaign`는 **활성 맵 O(1) 조회만** 한다. 예전엔 `places.find(2만 선형스캔)`로 `place.hidden`을 확인했는데, 저줌·넓은뷰에서 뷰당 수천 번 호출돼 **O(뷰×2만) 폭증**(완전 아웃/z11 실측 373ms→17ms). 활성 맵은 공개 데이터라 숨김 캠페인/숨김매장 소속을 이미 제외 → `place.hidden` 재조회 불필요. 루프 안에서 매장ID→매장 조회가 필요하면 `places.find` 반복 금지(맵 캐시 사용).
  - **renderSidebar 저줌 조기반환/디바운스(2026-09-14)**: `map idle`의 사이드바 갱신은 120ms 디바운스. `zoom < CAMPAIGN_MIN_ZOOM`(전국·광역)에선 캠페인 미로드로 목록이 어차피 비어 '확대 안내'만 뜨므로 **2만 매장 뷰포트 필터를 통째로 스킵**. 뷰포트 필터도 `bounds.hasLatLng(new LatLng())`(매장마다 객체 할당) 대신 경계값 숫자 비교. 마감임박 정렬은 장소별 최이른마감을 1회 메모(sort 비교마다 재계산 방지).
- **캠페인 뷰포트(bbox) 로딩(2026-09-01)**: 접속 시 캠페인 전량(활성 2.2만·10.2MB)을 받던 것을 **화면에 보이는 영역만** 받도록 전환(경량화). `loadInitialData`는 공개 앱에서 **매장(`?map=1`: 활성 캠페인 OR 후기 있는 매장만 — 지도 경량화 v2, 아래) + 배너 + `?count=active`(총수) + `?recent=24`(버블)** 만 받고 `campaigns`는 빈 채 시작. 지도 idle마다 `loadCampaignsForView()`가 뷰(`viewBoundsWithMargin`)를 `CAMPAIGN_TILE`(0.05°) 격자에 스냅해 **아직 안 받은 타일만** `/api/campaigns?active=1&bbox=W,S,E,N` 요청 → `campaigns`에 id 기준 dedupe 병합(`_loadedTiles`/`_loadedCampaignIds`/`_campInFlight` Set) → `invalidateActiveCache`+재렌더. **`CAMPAIGN_MIN_ZOOM`(11) 미만**(전국·광역 뷰)에선 캠페인 로드 안 함(클러스터만; 사이드바는 "확대하면 협찬이 보여요" 힌트). **지도 경량화 v2(2026-09-11)**: 매장 전량(39k) 대신 **`?map=1`(활성 캠페인 OR 후기 매장만, ~20.7k·8.2MB→4.9MB)** 로드 → 죽은 매장 ~1.6만 제외로 모바일 파싱/렌더 경감(방문 69% 모바일웹). 죽은 매장은 지도에서 빠지나 **검색은 서버 전체 대상**: `searchRegion`이 in-memory(map-set) 미스 시 `searchPlacesOnServer`가 `/api/places?q=이름`(전체 비숨김)으로 찾아 `places`에 병합→`focusPlace`(죽은 매장도 검색→후기 등록 가능). 클러스터링·사이드바는 map-set in-memory로 그대로 작동(활성 매장은 전부 포함). `updateStatCount`는 서버 `totalActiveCount` 사용(어드민은 전량 로드라 `campaigns` 집계로 폴백). 라이브버블은 `recentCampaigns`(매장명 조인) 사용. **화면 밖 매장을 focus(버블·검색)로 열 때**는 `ensurePlaceCampaigns(placeId)`가 `?active=1&placeId=`로 그 매장 캠페인을 먼저 확보(빈 상세 방지). 제보 등록 시 `campaigns.push`+`_loadedCampaignIds.add`+`totalActiveCount++`. 효과: 초기 15MB→매장(gzip~1MB)+뷰포트 캠페인 수백건, 메모리 캠페인 객체 2.2만→화면당 수백. 어드민(`/admin`)은 통계용으로 캠페인 전량 로드 유지.
- **데이터 로드 실패 폴백(`#mapError`)**: `loadInitialData`가 `/api/places`·`/api/campaigns` 응답이 `!res.ok`(예: 서버 장애/DB 읽기한도 500)이거나 배열이 아니면 **에러를 던짐**. 부팅 핸들러(`window load`)가 `try/catch`로 잡아 `showMapError()`(기존 지도 스크립트 실패용 오버레이 재사용) + `hideAppLoading()` 후 중단 → 빈 지도/무한스피너 대신 "지도를 불러오지 못했어요 / 다시 시도"(reload). 실패 시 `_dataLoadPromise=null`로 메모 해제(재시도 가능). `.map-error`는 `position:fixed;z-index:10000`이고 `showMapError`가 오버레이를 `document.body` 최상위로 옮겨(부모 스태킹 컨텍스트 탈출) PC 사이드바·아이콘레일·라이브캐릭터까지 **화면 전체를 덮음**. 배너는 비필수라 실패해도 빈 배열로 넘어감.

## 지도 마커 렌더링 / 격자 클러스터링 (`renderMarkers`)
- **뷰포트 컬링**: 화면(+40% 마진, `viewBoundsWithMargin(0.4)`)에 들어오는 매장만 대상. 지도 idle(줌/이동 멈춤)마다 120ms 디바운스로 재렌더. **지도 경량화 v2(2026-09-11)** 이후 `places`는 이미 '활성 OR 후기' 매장만이라 뷰 안이면 모두 표시(활성=컬러핀 / 후기만=회색핀 **정상 노출**). 죽은 매장은 로드 안 되므로 회색핀 dim(구 `.map-pin-ended` opacity 0.5)·`GRAY_PIN_MIN_ZOOM` 게이트는 제거됨(회색핀=후기 있는 가치 있는 매장이라 흐리게 할 이유 없음).
- **자체 격자(grid) 클러스터링(2026-08-30)**: 네이버 `MarkerClustering`(js/MarkerClustering.js, **점마다 DOM 마커를 만든 뒤 뭉침**)이 매장 1.4만+에서 줌아웃 시 병목 → **supercluster류 격자 방식으로 대체**. 화면 **~72px 셀**(`cellDeg = 72*360/(256*2^zoom)`)로 매장을 버킷팅해 **셀 단위로만** 마커 생성: 셀 2개↑ → 클러스터 1개(`.cluster-marker`, **정확한 합계 개수**, 클릭 시 `setZoom(z+3)` 확대) / 1개 → 개별 핀(`.map-pin`). **점마다 DOM을 안 만들어** 저줌 수천 점도 마커 DOM이 "보이는 셀 수(수백)"로 상한(실측: 줌7 전국 1.4만 매장 → 클러스터 DOM 30개). 개별 핀 지터(`getJitteredPositions`)는 단독 셀에만 적용. `markerMap[placeId]`는 개별 핀에만 존재(클러스터 안 매장은 없음 → `setSelectedMarker`/카드 하이라이트는 존재 가드).
- 네이버 `MarkerClustering`은 미사용(index.html 스크립트는 아직 로드되나 호출 안 함). `markerCluster` 전역은 잔여 정리용.

## 사이드바 "모집 중인 협찬" 정렬
- **마감임박순**으로 정렬(2026-07-27). 장소별 `getActiveCampaigns(p.id)`의 마감일 중 **가장 이른 것**(`deadlineToUTC`)을 오름차순. 마감일 빈 값(상시)은 `Infinity`라 **맨 아래**로 감.
- 마감일 **동률이면 세션마다 무작위로 셔플**(`placeShuffleKey`, 2026-07-28). 배치 등록(강남맛집 N건→디너의여왕 N건)으로 같은 마감일·같은 플랫폼이 뭉텅이로 붙는 걸 방지. 난수는 **페이지 로드마다 새로 생성**(방문할 때마다 순서 변화) + **세션 중엔 장소ID별로 고정**(지도 이동·리렌더에도 안 튐). 과거 tie-break였던 "최근 등록 먼저"는 이 셔플로 대체됨.
- 신선함/최신 제보는 "실시간 제보 알림 말풍선"이 담당하므로 리스트는 행동 유도(마감 전 신청) 목적의 마감임박순으로 분업.
- 변경 이력: 마감일순 → (D-day/마감 시스템 제거 시기) 등록순 → **마감임박순으로 회귀**(마감일 필수화로 정렬 신뢰 가능).

## PC 모달 모드 클래스
- `body.pc-report-mode`, `body.pc-reportissue-mode`: PC 사이드패널에서 보여지는 신고하기/제보하기 폼에 적용되는 오버라이드 클래스. Figma PC 디자인과 입력 높이(48px)/폰트(16px)/textarea(120px)/버튼(56px·18px) 등을 맞춰둠.

## 검색 결과 리스트 (신고하기 `#reportResultsList`, 제보하기 `#placeResultsList`)
- 공통 클래스 `.place-results-list`로 간격 규칙 통일: 비어있으면 숨김, 내용 있으면 위에 8px 간격.
- 신고하기(`renderReportResults()`)는 항목을 선택하면 리스트가 **선택된 1개만** 남도록 축약됨 (스크롤 불편 해소 목적). 다시 선택 해제하면 전체 리스트 복원.
- **매장 상세 "협찬 없음 → 제보하기"**(`campaignEmptyHtml`의 버튼 → `openReportForPlace(placeId)`)는 제보 모달을 열면서 **그 매장을 step1에서 이미 선택된 상태로 시작**(매장 검색 단계 생략). `openModal()` 후 `inputName`/`lastSearchQuery`를 매장명으로 세팅하고 `selectExistingPlace(placeId)` 호출 — 모바일·PC(report 탭) 공통. 사용자는 바로 "다음"으로 step2 진입.

## 실시간 알림 캐릭터/말풍선 (`#liveBubble`, `.live-character-wrap`)
- 지도 우측 하단에 떠서 최근 활동을 랜덤 메시지 풀에서 순환 노출 (`showLiveBubble()`)
- **후기 등록 알림으로 전환(2026-09-15)**: 예전엔 캠페인 추가를 `"익명님이 ○○을 추가했어요"`로 알렸는데, 대부분이 크롤링(AI/admin)이라 실제 제보가 아니고 오해 소지(가짜 익명) → **진짜 유저 활동인 '후기 등록'만** 알림. 문구 `"○○님이 <매장명> 후기를 등록했어요!"`. `buildLiveMessagePool`이 **서버 `?reviews=recent`(최근 후기, 매장명·닉네임 조인) = `recentReviews`** 기반으로 구성(캠페인 `recentCampaigns` 폐기). 후기 없으면 빈 풀 → 말풍선 미표시. **왜**: 크롤링 캠페인의 가짜 "추가" 알림 제거 + 후기(공생) 유도. 관련 결정 [[06-decision-log]].
- 말풍선 클릭 `clickLiveBubble()` → **`_forceReviewTab=true` 설정 후** `focusPlace(placeId)` → 매장 상세를 **후기 탭으로 바로** 오픈(활성 캠페인 있어도 후기 우선). `_defaultDetailTab(place)`가 이 플래그면 `'review'` 반환 → 탭 하이라이트(`detailTabsHtml`)+**패널 display(`rv-pane-*`)** 둘 다 이 기준으로(예전엔 패널 display가 `active.length` 기준이라 탭↔패널 어긋났음). `initDetailTabs`가 1회성 소비 후 `_forceReviewTab=false` 리셋(일반 핀 클릭은 기본탭 유지).
- 부모 `.live-alert`가 `pointer-events: none`이라 클릭 가능하게 하려면 `.live-bubble.show`에 `pointer-events: auto`를 개별 지정해야 함 (캐릭터 래퍼도 동일 패턴)
- **캐릭터 UI/클릭 통일(2026-09-19)**: 예전엔 캐릭터 아래 '제보하기' 버튼(`.live-cta-btn`)이 붙고 클릭 시 `openModal`(제보)이었으나 → **버튼 제거**, 모바일도 PC 이미지 사용(`getChFrames`가 항상 PC 프레임 `img_ch_01~05` 반환) 64x64 회색원+그림자, **캐릭터 클릭 동작을 말풍선과 동일하게 `clickLiveBubble()`(=후기)** 로 변경. 제보 진입은 PC 상단탭/모바일 사이드메뉴에 유지. **왜**: 제보 중요도가 낮아지고 후기(공생)로 무게 이동 → 클릭 동작 통일. 관련 결정 [[06-decision-log]].

## 앱 푸시 탭 처리 (`initPush`/`attachPushActionListener`/`applyPushNav`, 네이티브 전용, 2026-09-22)
- 네이티브 앱(Capacitor)만. 하루요약 푸시에 `data.placeId`(+폴백 `lat/lng`)가 실려오고, 탭 시 **`applyPushNav`** 가 `placeId`면 `focusPlace`(매장 바텀시트 상세), 없으면 관심좌표로 이동+토스트.
- **콜드스타트 레이스 해소**: 앱이 종료된 상태에서 푸시 탭으로 켜지면 `map`이 준비되기 전 탭 이벤트가 와 `map.setCenter`가 조용히 실패(무반응)하던 문제 → 리스너를 데이터 로드 전 **일찍 등록**(`attachPushActionListener`, load 핸들러 `initMap` 직후), 지도 준비 전 탭은 `_pendingPushNav`에 큐잉 → `renderAll` 뒤 **`drainPendingPushNav`** 로 처리.
- **포그라운드 자동이동**: 앱을 켜둔 채 푸시가 오면 안드로이드는 트레이에 안 남기고 배너만 잠깐 떠 탭할 게 없음 → `pushNotificationReceived`로 포그라운드 도착을 잡아 `applyPushNav`를 바로 실행(탭 없이 이동).
- `app.js`는 서버(server.url)에서 로드돼 **배포만으로 앱에 반영**(플러그인은 이미 APK). 서버 발송 로직·문구는 [[api-db]]·[[16-push-notifications]].

## 정보창(인포윈도우) 뱃지
- "공휴일 불가" 뱃지: `excludeHoliday`가 true일 때 노출, 폰트 컬러 `#000`

## 제보하기(캠페인 등록) 폼의 닉네임/링크 — 이메일 입력 없음
- `#modalOverlay` 제보 폼에는 이메일 입력란이 없음(완전히 삭제됨, 숨김 아님). 로그인 사용자는 세션의 OAuth 이메일이 서버에서 조용히 `founder_email`/`reporter_email`에 채워지고, 비로그인 사용자는 이메일을 전혀 수집하지 않음(닉네임 + 블로그/인스타 링크만).
- 로그인 상태에서 `resetModal()`은 `inputNickname`을 계정 닉네임으로 채우고 `readOnly`로 잠금. 프로필에 블로그/인스타(`currentUser.urlPlatform`/`urlId`)가 미리 등록돼 있으면 `inputUrlPlatformTrigger`에 `.locked` 클래스를 추가하고 `inputUrlId`도 `readOnly`로 잠가 수정 불가능하게 함 — 변경하려면 `#inputLockedHint` 안내 문구의 링크로 프로필 설정(`openProfileSheet()`)으로 이동해야 함.
- 프로필에 링크를 등록하지 않은 로그인 사용자나 비로그인 사용자는 평소처럼 직접 입력 가능(잠금 없음).
- **과거 마감일 제보 차단(2026-09-18)**: `submitCampaign`이 마감일(`deadline`)이 오늘(KST)보다 과거면 인라인 에러('마감일이 이미 지났어요…')로 막고, 서버(`api/campaigns.js` POST)도 `source!=='admin'`이면 400으로 재차 차단(이미 지난 캠페인 등록 방지, [[api-db]]).

## 이메일 선택 수취 (추가정보입력 / 내 정보)
- 카카오는 OAuth 이메일을 못 받는 경우가 많아(비즈앱 검수 필요), **이메일을 '추가 정보 입력'(`#signupEmail`)·'내 정보'(`#profileEmail`) 시트에서 선택 입력**받음. **네이버는 OAuth로 받은 이메일을 prefill**(`currentUser.email`), 카카오는 빈 칸. `confirmSignupInfo`/`saveProfile`이 `email`을 `/api/auth/profile`로 전송, 형식 검증 `isValidEmail`. 제보 폼 자체엔 여전히 이메일 입력란 없음(닉네임+링크만).

## 매장명 클릭 → 네이버지도 연결
- 인포윈도우(`.iw-name-link`)·모바일 상세시트(`.detail-name-link`)의 **매장명을 클릭하면 네이버지도로 이동**(`openNaverMapByPlace(placeId)` → `openNaverMap`). 매장명 옆에 `image/ic_link_16.svg`(외부링크 아이콘, 16px, 이름과 6px 간격) 표시.
- 검색어는 **매장명만** 사용(주소를 붙이면 지번/건물/호수 토큰까지 매칭하려다 네이버 장소검색 결과 0건 나는 케이스가 있어서). 매장명에 지점명이 포함돼 특정도 충분.
- 모바일은 앱 딥링크 `nmap://place?lat&lng&name`(좌표 기반 정확 위치), 앱 없으면 `map.naver.com/p/search/{매장명}` 웹으로 폴백. PC는 웹으로.

## 가입 후 SNS 등록 안내 — 1회만 노출
- 카카오/네이버 신규 가입(OAuth 콜백이 `?signup=1` 부여) 시 `openSignupInfoSheet()`로 SNS 링크 등록 안내. **한 번 노출하면 `localStorage.snsRegisterPrompted='1'`로 기록해 다시 자동 노출하지 않음**(건너뛰면 '내 정보'에서 직접 등록). load 핸들러는 `signup=1` + 실제 SNS 미등록(`currentUser` 있고 `urlPlatform/urlId` 없음) + 미노출일 때만 띄움 — 모바일 탭 폐기 후 복원으로 `signup=1`이 살아나도 중복 노출 안 됨. 제보 완료 후 SNS 권유(`maybePromptSnsRegister`)도 같은 플래그로 차단.

## 제보왕(리더보드) 배너 — 현재 숨김
- `app.js`의 `LEADERBOARD_ENABLED = false` 플래그로 PC/모바일 제보왕 배너 비노출(`renderLeaderboard`가 조기 반환, 60초 폴링도 안 돎). 베타 이벤트 시작 시 `true`로. API(`/api/users?leaderboard=1`)는 살아있음.

## 안드로이드 바텀시트/사이드바 부드럽게 (2026-09-18)
- iOS 대비 안드로이드 웹뷰에서 바텀시트 열림·확장이 버벅였음(저사양 기기 GPU 합성 부담). **바텀시트**(`.mobile-sheet`)에 `will-change: transform`+`backface-visibility: hidden`으로 GPU 승격, 내용(`.mobile-sheet-content`)은 `contain: layout paint`. `openMobileSheet`는 내용을 먼저 채우고 `.show`+`panTo`를 더블 rAF로 미뤄 첫 프레임 부담 분산.
- **사이드바 확장 FLIP**: 확장 시 `height` 트랜지션 대신 목표 높이로 즉시 점프 후 `translateY(delta)`→0 애니메이션(`animateSidebarHeightChange`), 확장할 때 리스트 재빌드 제거(`ensureSidebarList`, 비어있을 때만 렌더). 스크롤로 완전확장(`expanded-full`)은 스크롤 중이라 `transition:none`로 즉시 적용. 스크롤 페이드 마스크(`updateSidebarListFade`)는 rAF 스로틀+그래디언트 변경 시에만 재설정(`_lastFadeGradient`).
- **후기 말풍선 클릭 지연 제거**: `focusPlace`가 캠페인 네트워크(`ensurePlaceCampaigns`) 응답을 기다렸다 시트를 열어 한참 뒤 뜨던 것을 → **즉시 시트 오픈** 후 백그라운드 `.then`에서 캠페인 pane(`refreshOpenDetailCampaignPane`, `.rv-pane-campaign`만 교체)을 채움.
- 검색창(`.mobile-header-search`) placeholder 끝글자('색') 잘림 → 좌우 패딩 축소(20px→14px)+`letter-spacing:-0.02em`.
- **⚠️ iOS는 완벽 동작이라 위 변경이 iOS 거동을 바꾸지 않게 주의**(GPU 힌트/`contain`은 양쪽 무해 확인).

## iOS 네이버-블로그 인앱 Chrome 하단 크림 여백 (2026-09-12, 조사 완료)
- **증상**: **네이버 블로그 글의 muhyeop.com 링크를 탭 → iOS 인앱 Chrome**으로 열 때만, 하단에 **크림색(#f5f5f0) 108px 여백**(바텀시트 아래~툴바 사이) + 로딩 스플래시 아래도 크림. **일반 Safari·직접 Chrome·Capacitor 앱·Android·PC는 전부 정상**(여백 없음).
- **실측(온디바이스 디버그로 확정)**: `innerHeight = visualViewport.height = dvh = 665`, **`lvh = 773`**(차이 108px), `env(safe-area-inset-*) = 0`, `visualViewport.offsetTop = 0`, 검색바 `top:16`(정상 위치). 즉 브라우저 API는 전부 665로 보고하는데 실제 보이는 높이는 773.
- **CSS로 못 잡는 이유(검증됨)**:
  - 그 108px 밴드 자리에 **fixed 요소(마젠타 테스트)를 놔도 안 그려짐** → 웹페이지가 못 칠하는 **브라우저 예약 영역**.
  - 셸을 `lvh(773)`로 키우면 지도(flex)는 밴드를 채우지만, 이 인앱 Chrome은 **콘텐츠를 스크린 최상단(주소창 뒤)부터 앵커**하고 **주소창 높이를 안 노출**(`safe-area=0`, dvh/vv/innerHeight 모두 665로 동일, lvh만 773) → **상단 검색바가 주소창 뒤로 숨는 회귀** 발생. 위를 밀 신뢰 가능한 기준값이 없음.
  - `calc(100lvh - 100dvh)`는 이 인앱 Chrome에서 **0으로 계산되는 버그**(JS probe로 px 실측해도 밴드필은 예약영역이라 여전히 안 보임).
- **시도했다가 전부 되돌린 것**(commit 2a1d03b에서 표준 복구): `--app-height=innerHeight`, `body:100lvh`, `.app-splash/.app-loading:100lvh`, `html{background:#fff}`, `body::after` 흰색 밴드필(CSS calc/JS-var 둘 다), `.splash-char bottom:calc(100lvh-100dvh)`. → 모두 무효 또는 상단 회귀 유발.
- **현재 상태(표준·클린)**: `body{height:100dvh}`, `.app-splash/.app-loading{inset:0}`, `.splash-char{bottom:0}`. `app.js`의 `setAppHeight()`는 `--app-height` 설정 + 화면 복귀 시 네이버 지도 리프레시 용도로 최소만 유지(`.sidebar.expanded`가 `--app-height` 사용).
- **viewport-fit=cover 제거 실험(2026-09-12) → 실패**: 웹에서 `viewport-fit=cover`를 빼도(앱만 JS로 유지) 인앱 Chrome 여백 그대로(실기기 확인). commit 149633e에서 원복. → **CSS/메타로 못 잡는 인앱 Chrome 예약영역으로 최종 확정.**
- **최종 확인**: iOS Chrome 업데이트 후 동일 진입 경로에서 하단 여백이 사라짐. 서비스 코드 문제가 아니라 **구버전 iOS Chrome/네이버 인앱 Chrome 조합의 렌더링 버그**로 판단.
- **운영 메모**: 재발 신고가 들어오면 코드 workaround를 추가하기 전에 사용자의 iOS Chrome/네이버 앱 업데이트 여부를 먼저 확인한다. `dvh/lvh`·`viewport-fit`·밴드필 실험은 상단 검색바 회귀를 만들 수 있으므로 재시도 금지. 관련 메모 [[project_ios_inapp_viewport]].

## 전역 텍스트/이미지 드래그 방지 (앱 느낌)
- `body`에 `user-select: none` + `-webkit-touch-callout: none`, `img/a`에 `user-drag: none`. `dragstart`/`contextmenu`를 전역 차단(길게누름·우클릭 메뉴 방지). **입력 요소(`input/textarea/[contenteditable]/select`)는 예외로 선택·붙여넣기·우클릭 허용**. 지도 패닝(네이버 자체 핸들러)·바텀시트 스와이프는 영향 없음. → "왜 텍스트 선택이 안 되지"는 의도된 동작.
