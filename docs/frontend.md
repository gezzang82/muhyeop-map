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
  - **초기 로딩 경량화(2026-11-05)**: 첫 방문(저장 위치 없음) 기본 줌을 **11(광역)→13(구 단위)** 로 낮춤 — 줌11은 뷰포트가 넓어 `loadCampaignsForView`가 0.05° 격자로 쪼개면 캠페인 타일이 **~100개** 떠 초기 버퍼링이 심했음(스레드 유저 "지도 느리다" 피드백). 줌13이면 타일 ~8개. `initMap` 기본 줌과 `_initialViewBounds`(프리페치) 둘 다 13으로 일치. 추가로 **GPS 대기 게이트**(`_awaitingInitialLocation`): 첫 방문 콜드스타트엔 `tryInitialLocation`의 GPS가 곧 내 위치(zoom 15)로 옮기므로, **확정 전까지 `loadCampaignsForView`를 보류**(중간 서울뷰 타일 로드 낭비 방지)하고 GPS 성공/해외/거부/1.8s 폴백에서 해제 후 최종 위치서 로드. 프리페치(`_fetchCampaignTiles(_initialViewBounds())`)는 게이트 무관(줌13이라 경량·첫 핀 즉시 표시). 재방문(저장 위치)은 zoom 15라 영향 없음.
  - **핀 직접 클릭도 캠페인 확보(2026-09-23)**: 예전엔 `focusPlace`(버블·검색)만 `ensurePlaceCampaigns`를 불러, **팬 직후 새 핀을 직접 클릭**하면 그 타일 캠페인이 아직 로드 전이라 상세가 "캠페인 없음"+후기탭 우선으로 떴음 → `openMobileSheet`/`openPcCard`도 즉시 오픈 후 `ensurePlaceCampaigns(place.id).then(refreshOpenDetailCampaignPane)`로 캠페인 pane을 채우고 캠페인 탭으로 되돌림(`ensurePlaceCampaigns`는 멱등이라 focusPlace 경로 이중호출 무해).
- **데이터 로드 실패 폴백(`#mapError`)**: `loadInitialData`가 `/api/places`·`/api/campaigns` 응답이 `!res.ok`(예: 서버 장애/DB 읽기한도 500)이거나 배열이 아니면 **에러를 던짐**. 부팅 핸들러(`window load`)가 `try/catch`로 잡아 `showMapError()`(기존 지도 스크립트 실패용 오버레이 재사용) + `hideAppLoading()` 후 중단 → 빈 지도/무한스피너 대신 "지도를 불러오지 못했어요 / 다시 시도"(reload). 실패 시 `_dataLoadPromise=null`로 메모 해제(재시도 가능). `.map-error`는 `position:fixed;z-index:10000`이고 `showMapError`가 오버레이를 `document.body` 최상위로 옮겨(부모 스태킹 컨텍스트 탈출) PC 사이드바·아이콘레일·라이브캐릭터까지 **화면 전체를 덮음**. 배너는 비필수라 실패해도 빈 배열로 넘어감.

## 지도 마커 렌더링 / 격자 클러스터링 (`renderMarkers`)
- **뷰포트 컬링**: 화면(+40% 마진, `viewBoundsWithMargin(0.4)`)에 들어오는 매장만 대상. 지도 idle(줌/이동 멈춤)마다 120ms 디바운스로 재렌더. **지도 경량화 v2(2026-09-11)** 이후 `places`는 이미 '활성 OR 후기' 매장만이라 뷰 안이면 모두 표시(활성=컬러핀 / 후기만=회색핀 **정상 노출**). 죽은 매장은 로드 안 되므로 회색핀 dim(구 `.map-pin-ended` opacity 0.5)·`GRAY_PIN_MIN_ZOOM` 게이트는 제거됨(회색핀=후기 있는 가치 있는 매장이라 흐리게 할 이유 없음).
- **자체 격자(grid) 클러스터링(2026-08-30)**: 네이버 `MarkerClustering`(js/MarkerClustering.js, **점마다 DOM 마커를 만든 뒤 뭉침**)이 매장 1.4만+에서 줌아웃 시 병목 → **supercluster류 격자 방식으로 대체**. 화면 **~72px 셀**(`cellDeg = 72*360/(256*2^zoom)`)로 매장을 버킷팅해 **셀 단위로만** 마커 생성: 셀 2개↑ → 클러스터 1개(`.cluster-marker`, **정확한 합계 개수**, 클릭 시 `setZoom(z+3)` 확대) / 1개 → 개별 핀(`.map-pin`). **점마다 DOM을 안 만들어** 저줌 수천 점도 마커 DOM이 "보이는 셀 수(수백)"로 상한(실측: 줌7 전국 1.4만 매장 → 클러스터 DOM 30개). 개별 핀 지터(`getJitteredPositions`)는 단독 셀에만 적용. `markerMap[placeId]`는 개별 핀에만 존재(클러스터 안 매장은 없음 → `setSelectedMarker`/카드 하이라이트는 존재 가드).
- 네이버 `MarkerClustering`은 미사용(index.html 스크립트는 아직 로드되나 호출 안 함). `markerCluster` 전역은 잔여 정리용.

## 카테고리 필터 (칩 → 바텀시트, 2026-09-22)
- 칩 줄(PC `.pc-chips-row`/모바일 `.mobile-chips-row`) 맨 앞에 **카테고리 칩**(`data-category-chip`) 추가. 공통 진입은 `applyCategoryFilter(value)`(값 '전체'=필터 해제) → 칩 라벨·아이콘 갱신(`updateCategoryChip`, `categoryChipIcon`) → `renderAll`.
  - **⚠️ 지역+카테고리 검색("인천 카페")은 칩이 아닌 '검색'으로 처리(2026-10-31)**: 검색창에 "인천 카페"를 **유지**하고 카테고리 칩은 **전체**로 둔 채, 카테고리는 내부 필터 `_searchCatFilter`(+`_regionFilter`)로만 건다(=지역+키워드 "인천 순대국"과 동일 UX). 칩(`currentCategoryFilter`)을 직접 바꾸지 않음. 검색창을 **사용자가 비우면**(네이티브 X·백스페이스) `initMapSearchReset`의 input 리스너가 `_searchCatFilter`/`_nameFilter`/`_regionFilter`를 해제하고 `renderAll`→'제자리로'(전체). 프로그램적 비우기(`clearSearchInput`, GNB·현재위치 등)는 `_suppressSearchResetOnInput` 플래그로 이 리셋을 억제. **핀 상세 오픈(`openPcCard`/`openMobileSheet`)은 `resetMapSearch` 대신 `clearSearchPin`만 호출** → 검색 핀·FAB만 제거하고 **검색어·검색필터는 유지**(핀 선택해도 "구월동 카페" 그대로). 상세 아래 [[지역+카테고리]] 항목.
  - **모바일**: 칩 탭 → `openCategoryFilter()` → 숨은 `<select id="filterCategory">`로 **제보폼 카테고리 바텀시트(`openSelectSheet`) 재사용**(`pickSelectItem`의 `filterCategory` 분기가 `applyCategoryFilter`).
  - **PC(Figma 1105-2)**: 칩 탭 → `toggleCategoryDropdown` → 칩 **바로 아래 드롭다운**(`#catDropdown`, `.cat-dropdown-item`). `.pc-chips-row`가 `overflow:auto`(칩 가로스크롤)라 드롭다운을 잘라먹어 → 드롭다운은 `position:fixed`로 오버플로우 탈출 + 열 때 칩 `getBoundingClientRect`로 top/left 지정. 바깥 클릭 시 닫힘(`_closeCatDropdownOutside`), 열림 시 캐럿 180° 회전(`.dropdown-open`).
  - **칩 표기**: 아이콘 없이 텍스트만. 기본 "카테고리", 선택 시 카테고리명. 선택 상태 = `.active`(연한 테두리 `#aaa` + 볼드).
- **지역+카테고리 검색(2026-10-31)**: 지도 검색창에 **"전라북도 숙소"·"성수 카페"** 처럼 지역+카테고리를 넣으면, 리스트(picker) 대신 **그 지역 범위로 지도를 이동 + 카테고리 필터를 적용해 지도에 핀/클러스터로** 보여줌(`searchRegion`→`tryRegionCategorySearch`). 흐름: ① `detectSearchCategory`가 검색어에서 카테고리 키워드 탐지(`SEARCH_CATEGORY_KEYWORDS`, 긴 것 우선·정규명=CATEGORY_PINS 키) → ② 키워드 뺀 **지역부를 네이버 지오코딩**(한국 좌표일 때만 발동, 아니면 false→일반 매장검색으로 폴백=매장명형 보호) → ③ `map.setCenter`+`regionExtentZoom`(**도(道)=zoom 9 전체범위**, 광역시=11, 그 외 `regionZoom`) + `applyCategoryFilter(cat)`. **매장명 정확일치 다음 우선**(searchRegion 내 placeMatches 직후 삽입)이라 "카페노티드" 같은 매장명은 지역부("노티드") 지오코딩 실패로 일반검색으로 빠짐. **카테고리는 칩이 아닌 내부 필터(`_searchCatFilter`/`matchesSearchCatFilter`)로 적용** — 검색창에 "인천 카페" 유지, 카테고리 칩은 전체(2026-10-31, 지역+키워드와 동일 UX). 지역부 없이 카테고리만("숙소") 넣으면 **현재 지도에 그 카테고리만 필터**(이 경우만 칩 사용=`applyCategoryFilter`). 도 단위는 zoom<CAMPAIGN_MIN_ZOOM이라 캠페인 핀은 확대해야 로드(토스트로 안내)되고 그 전엔 카테고리 클러스터만 표시. **검색창을 비우면 모든 검색필터 해제+전체 재렌더**(`initMapSearchReset`, 프로그램적 클리어는 `_suppressSearchResetOnInput`로 억제).
  - **행정구역 경계 필터(`_regionFilter`/`matchesRegionFilter`, 2026-10-31)**: 뷰포트가 사각형이라 "인천 카페"에서 **인접 서울·경기 카페까지 핀으로 새던 문제** → 지오코딩 `addressElements`에서 시/군/구(`SIGUGUN`, 없으면 시/도 `SIDO` 약칭 stem: 인천광역시→인천)를 뽑아 **매장 주소가 그 구역에 속한 것만** 표시(카테고리·이름 필터와 AND). "인천 카페"=인천 소재 카페만, "송파구 헤어"=송파구만. 지역+카테고리·지역+키워드 양쪽 적용. 해제·보존 규칙은 `_nameFilter`와 동일(새 검색/카테고리칩 해제, 핀 상세 오픈 시 보존).
- **지역+매장명 키워드 검색(2026-10-31)**: 카테고리에 없는 메뉴/상호도 지역과 함께 찾기 — **"경주 순대국"·"역삼 스타벅스"** 처럼. `searchRegion`→`tryRegionCategorySearch` 다음 우선순위로 `tryRegionNameKeyword`: **마지막 토큰=키워드, 앞=지역**. ① 지역부가 한국 좌표로 지오코딩되고 ② `mergeServerPlaces(키워드)`로 서버 전체(죽은 매장 포함) 검색해 **그 키워드를 매장명에 포함한 매장이 존재**할 때만 발동 → 지역 이동(`regionExtentZoom`) + **이름 필터(`_nameFilter`/`matchesNameFilter`)** 적용해 지도에 해당 핀만(리스트 없음, 카테고리 필터는 해제). 매칭 0이면 false→일반 검색 폴백(매장명형 "카페노티드" 보호). `_nameFilter`는 **매장명 부분일치**라 메뉴가 이름에 없으면(예 상호 "경주맛집"+메뉴 순대국) 누락될 수 있음(카테고리 검색보다 정밀하나 커버리지 제한). 해제: 새 검색 시작마다 초기화 + `resetMapSearch`(카테고리 칩 선택 등)에서 clear. `renderMarkers`/`renderSidebar`가 `matchesNameFilter`를 카테고리·채널 필터와 AND로 적용. 검색 우선순위: **⓪랜드마크/명소/역** → ①매장명 정확일치 → ②지역+카테고리 → ③지역+매장명 키워드 → ④일반(지역 geocode→네이버 POI).
- **랜드마크 우선(`tryLandmarkByNaver`, 2026-11-01)**: "경복궁" 검색 시 동명 상호(경복궁 갈비 등)에 exact 매칭돼 그 매장으로 가던 문제 → **exact 매칭 앞에** 랜드마크 체크를 둠. 접미사 게이트(`역|궁|릉|대교|대학교|공원|수목원|식물원|해수욕장|해변|계곡|폭포|산`)에 걸리면 네이버 지역검색 1회 → top 카테고리가 **`여행,명소`·교통(지하철/전철/터미널/공항)·대학교**면 그 위치로 이동+핀(음식점 등 상호면 false→매장검색). '여행,명소' **상위 카테고리**로 매칭해 '수산물' 같은 부분문자열 오매칭 방지. (기존 '역'만 보던 `tryStationByNaver`를 일반화·전진배치)
  - **상위 N개 스캔(2026-11-06)**: top1만 보던 것을 **상위 5개 스캔**으로 보강 — "설악산" 검색 시 #1이 설악케이블카(레저)라 놓치던 것을 #2 설악산국립공원(여행,명소)으로 집음. 카테고리에 국립/도립/군립공원 추가. **섬/명소 폴백 `searchRegionViaLocalSearch`도 동일 스캔**(지역 접두사 붙어도 'query가 결과명으로 끝나면' 매칭 → "창녕 관룡사"·"울릉도"·"남이섬"이 POI 피커 대신 그 위치로 이동). 오늘 검색로그 기반(울릉도 3×·창녕 관룡사 2×). **미해결(known limit)**: "경주 불국사"처럼 지역+유명사찰은 네이버 지역검색이 동명 식당만 반환해 못 잡음(사찰명은 '사' 접미라 랜드마크 게이트에도 미포함).
- **필터 적용 지점**: `renderMarkers`의 `visiblePlaces`와 `renderSidebar`의 `activePlaces`에 `matchesCategoryFilter(place)` AND 조합(`place.category`, 빈값=기타). **채널 필터와 독립적으로 AND**(채널=캠페인 속성/`hasActiveCampaign` 경유, 카테고리=매장 속성).
- **카테고리 11종 + 핀(`CATEGORY_PINS`)**: 음식점·카페·뷰티·**헤어**·**사진관**·숙박/여가·문화·의류·안경/잡화·운동·기타. 각 색+화이트 아이콘(`getCategoryPin`). 신설: **헤어**(`#45C04D` 가위, Figma 1040-9167, 뷰티에서 분리)·**사진관**(`#1AA0E3` 카메라, Figma 1658-59044, 문화에서 분리)·운동(`#E77844`). 서버 분류/스윕은 [[api-db]]·[[06-decision-log]]. **기타 오분류 재분류(2026-10-13)**: 기타 6,730개 중 오분류 139건을 기존 카테고리로(사진관+100·운동+29 폴댄스·뷰티+10). 기타 안 **신규 카테고리 분리후보**(자동차/세차·파티룸·꽃·반려동물 등)는 추후 추가 논의 [[06-decision-log]].
- **칩 디자인**: 채움(fill) → **아웃라인**으로 변경(Figma 1156-1905). 선택 상태 = 흰 배경 + 연한 테두리(`#aaa`, 1.5px) + 볼드(선택 표시는 주로 볼드 텍스트). 칩 아이콘은 배경 서클 없이 글리프만 `currentColor`. `filterChannel`의 active 토글은 `.filter-chip[data-channel]`만 대상(카테고리 칩 제외).
- **셀렉트시트 위치**: `#selectSheetPanel`은 원래 제보 모달 안에 있어, 모달 밖(지도 필터)에서 열 땐 `openSelectSheet`가 패널을 `document.body`로 되돌림(안 그러면 숨은 모달 안에 갇혀 안 보임). 모달 셀렉트를 다시 열면 그 모달로 재이동(자기교정).

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
- 네이티브 앱(Capacitor)만. 하루요약 푸시에 `data.placeId`(+폴백 `lat/lng`)가 실려오고, 탭 시 **`applyPushNav`** 가 `placeId`면 `focusPlace`(매장 바텀시트 상세), 없으면 관심좌표로 이동+토스트. **`kind:'comment'`+`postId`면**(수다방 댓글 푸시, 2026-11-05) 지도 로직 대신 `openCommunityPost(postId)`(커뮤니티 수다방 그 글로 이동, 위 수다방 댓글 섹션).
- **콜드스타트 레이스 해소**: 앱이 종료된 상태에서 푸시 탭으로 켜지면 `map`이 준비되기 전 탭 이벤트가 와 `map.setCenter`가 조용히 실패(무반응)하던 문제 → 리스너를 데이터 로드 전 **일찍 등록**(`attachPushActionListener`, load 핸들러 `initMap` 직후), 지도 준비 전 탭은 `_pendingPushNav`에 큐잉 → `renderAll` 뒤 **`drainPendingPushNav`** 로 처리.
- **포그라운드 자동이동**: 앱을 켜둔 채 푸시가 오면 안드로이드는 트레이에 안 남기고 배너만 잠깐 떠 탭할 게 없음 → `pushNotificationReceived`로 포그라운드 도착을 잡아 `applyPushNav`를 바로 실행(탭 없이 이동).
- `app.js`는 서버(server.url)에서 로드돼 **배포만으로 앱에 반영**(플러그인은 이미 APK). 서버 발송 로직·문구는 [[api-db]]·[[16-push-notifications]].
- **토큰 user_id 귀속(2026-10-09)**: `registerPushToken`이 `?push=register`에 `credentials:'same-origin'`으로 세션 쿠키를 실어 **로그인 상태 등록 시 `push_tokens.user_id`가 채워짐**(하루요약이 `user_places`→user_id→token으로 발송하므로 필수). 비로그인 등록분은 user_id NULL → 내 장소 알림 켜거나 로그인 상태 재접속 시 귀속.
- **내 장소 알림 ON 저장 → 권한·토큰 확보(`ensurePushForMyPlaceAlarm`, 2026-10-09)**: 내 장소 저장(`mlSave`/`pcPlaceSave`)에서 알림을 켠 채 저장하면 네이티브 앱일 때 **OS 알림 권한 맥락요청 + `P.register()`**(→토큰 등록, 로그인 상태라 user_id 귀속). 발송 대상은 서버가 `user_places.alarm_enabled`로 직접 조회([[api-db]] `notifyDailyDigest`).
- **알림 '탭'(앱 접근) 집계(2026-10-10)**: `pushNotificationActionPerformed`(실제 탭)에서 `POST /api/users?push=open`으로 1건 기록(payload의 `kind`=digest|event 구분, `placeId`, `deviceId`). 포그라운드 수신(`pushNotificationReceived`)은 탭이 아니라 미집계. 어드민 '알림 탭' 카드 [[admin]].
- **전역 `detectPlatform()`(2026-10-10)**: 방문집계 `_detectPlatform`과 동일 규칙(ios/android/app/mweb/pcweb)의 전역 함수. `refreshAuthUI`의 `/api/auth/me?platform=` 호출에 실어 보내 `users.last_platform`(마지막 접속 기기) 갱신([[api-db]]·[[admin]] 기기 컬럼).

## 하단 GNB 탭 — 햅틱·클릭집계·키보드 (2026-10-13)
- **햅틱**: `switchTab`에서 `hapticTap()` — 안드=`navigator.vibrate(35)`(impact LIGHT가 안드선 체감 안 됨)·iOS=`Haptics.impact LIGHT`(Taptic 또렷). `@capacitor/haptics`, 세기조정은 app.js(ms)만. 웹/구버전앱 no-op.
- **클릭 집계**: `switchTab`가 `POST /api/places?visit=gnb&tab=home|places|community|my`(fire-and-forget, 운영자 집IP 제외)로 탭별 클릭수 누적 → 어드민 'GNB 탭 클릭' 카드([[admin]]·[[api-db]]). `switchTab`은 GNB onclick 4개에서만 호출(프로그램 호출 없음 → 집계 뻥튀기 없음).
- **키보드 뜰 때 하단버튼 딸려올라옴(안드)**: 하단 고정버튼(`position:absolute bottom:0`, 예: 내 장소 장소추가 '이 위치로 선택'/'저장')이 키보드에 딸려 올라와 겹치던 것 → **Capacitor(Android15 edge-to-edge)가 IME 인셋을 웹뷰에 적용**해 웹뷰 리사이즈되던 게 원인. `Keyboard.resize:'none'`·manifest `adjustNothing`로 안 잡혀 → **`MainActivity` 인셋리스너에서 IME 인셋을 `Insets.NONE`으로 소비**해 리사이즈 차단(네이티브=빌드 필요). iOS는 `Keyboard.resize:'none'`+`initNativeKeyboard`로 처리. 상세 [[project_mobile_app]]·[[06-decision-log]].
- **검색 시 키보드 내림**: `mlStep1DoSearch`(내 장소 장소추가 지역 검색 Enter)가 input `.blur()`+네이티브 `Keyboard.hide()` — 예전엔 검색 후 키보드가 유지돼 하단 버튼을 가렸음.

## MY 버전 표기 (2026-10-13)
- MY 하단 버전은 **app.js `APP_VERSION` 상수**(현재 `1.1.1`)로 렌더(DOMContentLoaded에서 `.mypage-version-num` 세팅). 예전 하드코딩 `ver 0.1`(오래됨) 대체. 릴리스 때 **스토어 versionName(iOS/안드) = APP_VERSION**을 같이 올림(버전체계 3층: 사용자표기/빌드번호/웹캐시 — [[06-decision-log]]).

## 내 장소 저장 피드백 + 알림설정 (2026-10-08~10)
- **저장 성공 토스트**: 내 장소 저장 시 `mlSave`(모바일)·`pcPlaceSave`(PC) 공통으로 **'내 장소가 추가되었어요'(신규)/'변경사항을 저장했어요'(수정)** 토스트. 이전엔 시트만 닫혀 저장 여부가 불확실했음. (PC는 `pcPlaceSave`로 경로가 달라 둘 다 배선)
- **알림설정 3분류 + 서버 게이트(2026-11-05)**: MY>알림설정 토글이 **전체 알림 받기(마스터) + 하위 3종(내 장소 신규협찬 `alarmNewCampaign` / 커뮤니티 `alarmCommunity` / 이벤트·공지 `alarmEvent`)**. `onAlarmToggle`이 각 효력값(**마스터 && 하위**)을 계산해 **`POST /api/users?push=notifpref {digest, comment, event}`** 로 서버 3컬럼(`push_digest_enabled`/`push_comment_enabled`/`push_event_enabled`)에 반영(로그인 유저). 끄면 실제 발송 억제: digest=하루요약, comment=수다방 댓글(`handleSeoichuCommentAdd`가 작성자 `push_comment_enabled` 체크), event=이벤트 브로드캐스트(발송 시 끈 유저 제외, 단 **비로그인 기기는 user_id 없어 못 거름=한계**). 마스터 OFF면 하위 3개 dim+비활성(`applyAlarmGate`)+서버 3값 0. 커뮤니티 토글 신설(2026-11-05, 기존 digestpref→notifpref로 확장, 구버전 클라용 digestpref는 유지). per-place on/off는 내 장소별 `alarm_enabled`([[api-db]]).

## 커뮤니티 후기 정렬 (2026-10-10)
- 후기 피드(`_cmFeedSort`)·내 후기(`_myRevSort`) **기본 정렬을 좋아요순 → 최신순(`latest`)** 으로 변경(새 후기가 바로 안 보여 최신순이 자연스러움). 매장별 후기 리스트(`_reviewSort`)는 기존대로 최신순. 좋아요순은 정렬 버튼 토글로 유지.

## 커뮤니티 UX 개선 (2026-11-08, Figma 1999-9088)
- **후기 카드 매장 헤더(#1)**: 커뮤니티 **후기/내 후기** 피드의 후기 카드 상단에 **매장명 헤더**(`reviewCardHtml(r, isPreview, showStore)`의 `showStore=true`) — `.rv-card-store`(매장명 + 화살표), 탭하면 `openReviewPlace(placeId)`로 홈 지도의 그 매장 상세로 이동. 매장별 리스트(1건) 및 상세 미리보기는 `showStore` 없음(이미 매장 컨텍스트). CSS `.rv-card--store`는 `#cmBody`/`#myRevContent`/PC에서 세로배치.
  - **캠페인 탭 우선(2026-11-08)**: `openReviewPlace`는 상세를 열기 **전에 `await ensurePlaceCampaigns(placeId)`** 로 그 매장 캠페인을 먼저 확보 → `_defaultDetailTab`이 첫 렌더부터 **활성 캠페인 있으면 '캠페인' 탭, 없으면 '후기' 탭**을 정확히 고름(예전엔 시트를 먼저 열고 캠페인이 늦게 도착해 후기탭으로 시작되곤 함). 그 뒤 모바일 `switchTab('home',{silent:true})` / PC `switchPcTab('home')` → `focusPlace`.
- **탭 상태 유지(#2)**: 예전엔 홈↔커뮤니티 전환 때마다 `renderCommunity`로 재렌더+스크롤 리셋 → **`_cmRendered` 플래그**로 커뮤니티를 **1회만** 렌더(`openCommunity`가 세팅), `switchTab` 커뮤니티 분기가 `if(!_cmRendered)`일 때만 `openCommunity`/리셋 호출 → 홈 갔다 돌아와도 **세그먼트·스크롤 위치 보존**. 세그먼트 변경·당겨서 새로고침은 명시적 재렌더라 예외.
- **세그먼트 전환/첫 로드 로딩(#3b)**: `renderCommunity`가 리스트 컨테이너에 `cmCenterSpinner()`(가운데 스피너)를 먼저 깔고, 무한스크롤 첫 페이지(`offset===0`)에서 `listEl.innerHTML=''`로 교체 → 수다방↔후기 전환·첫 진입에 **로딩 스피너** 노출(빈 화면 깜빡임 제거). ⚠️ **스피너 2개 방지(2026-11-08)**: 첫 페이지엔 **가운데 스피너 + 하단 센티넬(`.cm-infinite.loading`) 스피너가 동시에** 떴음 → `createInfiniteScroll(…, {centerSpinner:true})` 옵션을 수다방·후기 호출에만 줘서 **`offset===0`에선 센티넬 `.loading`을 안 붙임**(가운데 스피너가 담당). 내 후기(`myRevSentinel`)는 가운데 스피너가 없어 옵션 미전달(센티넬 스피너 유지).
- **당겨서 새로고침(#3a)**: `#cmScroll` 최상단(`scrollTop<=0`)에서 아래로 당기면(`bindCmPullRefresh`, `openCommunity`에서 1회 바인드) `.cm-inner`가 저항감 있게 따라 내려오고(`translateY`, 0.5배·최대 90px), 임계(64px) 넘겨 떼면 `#cmPullIndicator` 스피너 돌며 `renderCommunity(true)`(캐시우회 새로고침). `.cm-scroll`은 `overscroll-behavior:none`이라 네이티브 바운스 없음(터치 전용, PC 무관).

## 수다방(커뮤니티) 댓글 (2026-11-04)
- 커뮤니티 세그먼트 **'이웃찾기' → '수다방'** 리네이밍(내부 키 `seoichu`는 유지, 표시 라벨·소개문구만). 댓글로 소통 공간 성격이 커짐.
- **댓글 표시**: 글 카드(`seoichuPostHtml`) 아래 **항상 전부 노출**(연회색 `.cm-sc-comments`), 메타행 우측 `💬 댓글 N`(`cmCommentIcon`=Figma 실물 `image/ic_comm_14.svg`). 목록 GET이 `comments[]` 임베드라 추가 요청 없음. 본인 댓글 🗑(`deleteSeoichuComment`).
- **입력 — 모바일**: `💬 댓글` 탭 → `openSeoichuCommentInput` → 키보드 위 고정 바텀바(`#scCmtBar`, auto-grow `cmAutoGrow`), 등록(`submitSeoichuComment`) 시 **바 닫힘+키보드 내림+대상 해제**, blur로도 닫힘. `initNativeKeyboard`가 `--kb-inset`로 키보드 위에 띄움.
- **입력 — PC**(`pc-community-mode`): 바텀바 대신 **글 댓글영역 아래 인라인 입력창**(`openPcInlineComment`, 한 번에 하나), 등록(`submitPcInlineComment`) 시 **인라인 닫힘**(PC/모바일 동작 통일). 공용 POST `_postSeoichuComment`, 갱신 `reloadSeoichuPostComments`(그 카드 댓글·카운트만 교체).
- **작성자 푸시 + 탭 네비(2026-11-05)**: 서버가 댓글 작성 시 작성자에 FCM/APNs 발송(`data:{kind:'comment', postId}`, [[api-db]]). 탭 시 `applyPushNav`가 `kind==='comment'`면 `openCommunityPost(postId)` → `switchTab('community',{silent:true})`(프로그램 전환이라 GNB 클릭 집계 제외)+수다방 세그먼트 강제(`setCommunitySeg('seoichu')`)+그 글(`.cm-sc-post[data-post-id]`)로 스크롤+`.sc-flash` 1회 하이라이트. 무한스크롤 첫 페이지 로드가 비동기라 `_scrollToSeoichuPost`가 글 DOM을 ~3s 폴링(없으면=오래된 글이라 첫 페이지 밖, 수다방 상단 머묾 폴백). 콜드스타트 탭은 `_pendingPushNav`→`drainPendingPushNav`로 큐잉 처리(지도 로직은 스킵). **안드(FCM)·iOS(APNs) 모두 수신**(iOS APNs 배선 완료 — `_push.js`가 플랫폼 분기, [[api-db]]).
- **auth 깜빡임 수정**: `refreshAuthUI`가 커뮤니티 탭 열려있으면 재렌더(첫 진입 로그인 확정 전 로그아웃 CTA가 뜨던 것). `seoichuComposeHtml`은 `_authChecked` 전엔 compose를 **미렌더**(빈박스·깜빡임 없음), 확정 후 등장. (근본은 `/api/auth/me` 응답 지연.)

## 블로그 글 불러오기 (후기 자동매칭, 2026-11) — 커뮤니티 후기 탭
네이버 블로그 체험단 글을 **한 번에 자동 등록**하는 기능. 엔진·API는 [[api-db]] `?blogimport=`·`_blogimport.js`, 기획 `docs/product/20`·[[06-decision-log]].
- **진입 카드**(`blogImportCardHtml`, `.bi-entry`): 커뮤니티 > **후기** 피드(`_cmSeg==='feed'`, `renderCommunity` 상단, `mine`일 땐 미노출)에만 렌더. 커뮤니티 **기본 진입은 수다방**(`_cmSeg='seoichu'`)이라 **후기 탭을 눌러야** 카드가 보임. **비로그인 미노출**. `currentUser.urlPlatform` 기준 A/B/C 분기 — **A**(`'블로그'`)=바로 "내 블로그 글 불러오기"(`openBlogImport`), **B**(미등록)=안내+"네이버 블로그 등록하기"(`openProfileSheet`), **C**(`'인스타그램'`)=블로그 등록 유도. `/api/auth/me` 응답 전엔 `biAuthCache`(localStorage `mh_bi_auth`)로 **낙관적 렌더**(늦게 뜨는 현상 방지). PC는 `switchPcTab`로 동일 `#tabView-community` 재사용(카드 그대로).
- **플로우**(모바일 풀스크린 / PC 가운데 모달): `#blogImportOverlay > .blogimport-modal`의 3스텝 `.bi-step` — 로딩(`#biLoading`, 캐릭터+진행문구) → 결과(`#biResult`, `biRenderResult`: 요약카드 + 글 리스트 체크박스, 매장 자동매칭 뱃지) → 완료(`#biComplete`, `biShowComplete`: 체크 애니 + 컨페티 `biConfettiBurst`). 결과에서 매장 매칭이 애매하면 **매장 직접선택 시트**(`#biStoreOverlay`, `biOpenStore`). 이 시트(`.bi-store-sheet`)는 **높이 85vh 고정**(2026-11-08) — 내용 hug면 재검색 시 짧아져 검색 입력칸이 키패드에 가려지던 문제라, 크게 고정해 입력칸을 항상 상단(키패드 위)에 두고 결과는 `.bi-store-results` flex 내부 스크롤. 상단 핸들(`#biStoreHandle`)을 **아래로 끌면 닫힘**(탭도 닫힘, 중간 놓으면 복귀 — `biStoreSwipeInit`). 등록은 `biCommit`→`POST ?blogimport=commit`.
  - **매장 선택 = 우리 DB + 네이버 병합(2026-11-08)**: 예전엔 `biStoreSearch`가 **우리 DB(`/api/places?q=`)만** 검색해 DB에 없는 매장(예: '옥된장 산본점' — 네이버엔 있으나 크롤된 적 없음)은 아예 못 골랐음 → DB + **네이버(`/api/search-place`)** 를 병렬 검색·병합(DB 먼저, 이름 정규화 중복 제외한 네이버결과는 '신규' 뱃지). 네이버 신규 선택 시 `biPickStore`가 **브라우저 지오코딩(`naver.maps.Service.geocode`)으로 좌표 확보** → '선택'(`biConfirmStore`) 시 **`POST /api/places`로 그 매장을 생성**(네이버 category를 바디 `naverCategory`로 보내 서버가 `mapNaverCat`으로 16종 매핑, [[api-db]])하고 그 placeId로 후기 매칭. 이후 일반 배치 커밋으로 등록. (지도 미로드 시 토스트 후 중단)
- **PC 모달 치수**(2026-11-07): 고정 760px 폐기 → `height:auto; max-height:88vh`로 **내용 높이에 맞춰 hug**(결과 많으면 `.bi-step-result`가 88vh서 내부 스크롤, 모바일은 `max-height:none`로 풀스크린). 타이틀 PC 20px(`.modal-scroll-header h2`, 모바일 26px). 하단 버튼은 **후기 등록 폼과 동일 규격**(PC 48px·16px / 모바일 56px·18px, 푸터 패딩 PC 20·모바일 12+safe). **빈 결과**(매칭 0)는 빨강 등록버튼 숨기고 **하단 고정 라인 버튼**(`#biCloseBtn`, `.btn-cancel`=흰 배경·회색 테두리·검정 텍스트) '닫기'. **완료 스텝 푸터**는 흐름배치(`position:static`+`margin:0 -24px`)라 hug돼도 겹침 없음·결과와 동일 폭.
- **진입 카드 모션**(2026-11-07): Beta 뱃지=Figma 2003-59442 워드마크(`image/badge_beta_text.svg`, 흰색)+움직이는 블루→마젠타 그라데이션 pill(`biBetaShine`). 카드 **테두리=균일한 빨강 라인 + 부드러운 호흡(pulse)**(`.bi-entry::before` 빨강 ring opacity `biEntryPulse` + `::after` 안쪽 마스크로 1.5px 링만). **왜 pulse**: 처음엔 회전 conic이었는데, conic은 **박스 가로세로 비율에 따라 변마다 밝기가 달라져**(PC 카드가 7:1로 넓어 좌우변이 흐려짐) PC↔모바일 불일치 → 비율 무관하게 네 변 동일한 **균일 빨강+호흡**으로 교체. `prefers-reduced-motion`에선 정지. 첫 노출 펼침 애니 `biEntryReveal`(1회, `_biEntryRevealed` 가드).
- **배치(30개씩) 불러오기 — 버튼 하나(2026-11-08)**: 예전엔 "한 번에 전체(최대300)"라 **느리고(AI 수백건) 결과도 수십개씩 쏟아져 검토가 지침**(실측 78개) → **"등록 안 된 것 중 최신 30개씩"** 배치로 전환. 엔트리 버튼은 **하나**(`openBlogImport`→`?blogimport=list`, 보조버튼·scope 파라미터 폐기). 서버 `importList({batch:30})`가 **네이버 글목록 API(`PostTitleListAsync`, `fetchBlogPage` 페이지단위)** 를 최신부터 순회하며 `existingUrls`(이미 등록) 제외하고 **30개 모이면 중단** → 그 30개만 AI(`extractPosts`, 보통 청크 1회라 빠름)+매칭. **제목만으로 OK인 이유**: 체험단 플랫폼이 후기검증 1차로 '제목에 매장명 포함'을 요구 → 체험단 글 제목엔 매장명 보장(요약 없이 제목만). **반복 흐름**: 결과에서 등록 → 완료화면 **'이어서 더 불러오기'**(`biContinue`, `_biDone`가 false일 때만 노출) → 서버가 방금 등록분을 `existingUrls`로 제외해 **그 다음(더 과거) 30개** 반환. 끝까지 가면 `done:true` → 빈결과 "모두 불러왔어요". **왜 배치**: ①속도(AI 30건/회) ②검토 피로↓(30개씩) ③등록이 곧 페이지네이션(등록할수록 과거로). 로딩은 점 애니메이션(`biLoadCount`, 가짜 카운트 폐기). `fetchAllBlogPosts`(최대300)는 유지보수/스크립트용으로만 남음. 결과/빈결과 안내문구(`.bi-note`)·수동 '후기 등록'(`openReviewRegister`) 링크 유지. [[api-db]] `_blogimport.js`·[[06-decision-log]]

## 외부 링크 인앱브라우저 (`openExternal`, 2026-11-08)
- 앱에서 외부 링크(캠페인 상세보기·후기 블로그·제보자 링크 등)는 모두 `openExternal` 한 곳을 지남(네이티브 클릭 인터셉터가 타 도메인 `a[href]` 가로채 호출).
- **앱-스킴 팝업 문제**: 레뷰(revu.net) 등 일부 캠페인 페이지가 상세보기 시 **자기 앱 딥링크(`revu://`)를 쏴 iOS가 "'레뷰'에서 열겠습니까?" 시스템 팝업**을 띄움. 기존엔 `@capacitor/browser`(=iOS SFSafariViewController)로 열어 이 팝업을 막을 수 없었음(시스템 컴포넌트).
- **해결 = 자체 커스텀 인앱브라우저 플러그인 `CustomBrowser`**(네이티브 직접 구현, `@capacitor/inappbrowser`는 앱-스킴을 `.allow`해 "Couldn't load" 나서 폐기): iOS `CustomBrowserPlugin`(MainViewController.swift, WKWebView)·안드 `CustomBrowserPlugin.java`(WebView). **`decidePolicyFor`/`shouldOverrideUrlLoading`에서 `revu://` 등 커스텀 앱 스킴을 조용히 취소**(앱 열기/팝업/에러 없이 웹페이지 유지), http(s)만 로드, tel/mailto/스토어는 시스템에. 영구 쿠키(로그인 유지). `openExternal`이 **런타임에 `Capacitor.Plugins.CustomBrowser` 있으면 그걸, 없으면 `Browser`(SFSafariVC) 폴백** → **app.js OTA라 구버전 바이너리 안전**, 새 네이티브 빌드 배포+업데이트 후 커스텀 브라우저 사용.
  - **UX 디테일**: 상단 바(닫기/도메인/새로고침), **웹뷰 바닥=세이프에어리어까지**(하단 홈인디케이터 여백 → 페이지 하단 버튼 안 답답), **하단 여백 색을 페이지 하단 버튼색에 자동 매칭**(강남맛집=주황 등, 하단만·상단 툴바는 흰색 유지; iOS=bottomBar / 안드=네비바색). **안드만**: ①WebView UA의 `wv` 마커 제거(리뷰노트가 "웹뷰 감지→앱 업데이트 넛지" 띄우던 것 방지, iOS는 UA에 wv 없어 무관) ②Dialog 윈도우 애니로 **아래→위 슬라이드**(iOS 모달 느낌). ⚠️ **네이티브라 스토어 재빌드·업데이트 필요**(app.js만으론 미반영). [[project_mobile_app]]·[[api-db]]·[[06-decision-log]].

## 가입 유입경로(클라, 2026-09-23)
- 방문 시 유입소스를 세션(`sessionStorage mh_src`)에 저장: `?ref`/`utm_source` 태그가 있으면 그 값, 없으면 최초 `document.referrer`를 채널로 분류(`classifyRefClient` — 네이버/카카오/인스타/스레드/구글/페북/당근/유튜브/틱톡, 그 외 host, 내부/빈값 제외).
- 로그인 시 그 소스를 로그인 URL `src`로 실어보냄: 카카오/네이버는 `oauthLogin(provider)`(index.html 로그인 버튼 `onclick`), 애플은 `appleSignIn`. `getSignupSrc()`가 `mh_src` 반환. 서버가 신규 가입 시 `users.signup_source`에 기록 → 어드민 회원목록 가입경로 [[api-db]]·[[admin]]. (방문 집계의 `?ref`와 같은 소스, 여기선 회원 단위 귀속)

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

## 이벤트 팝업(공지 배너) — 캐러셀 (2026-09-24)
- 접속 시 `#bannerPopupOverlay`에 **활성 배너 전체**를 캐러셀로 노출(예전엔 `getActiveBanner`가 1개만 반환 → `getActiveBanners`로 전부). 활성=숨김 아님 + 오늘이 `startDate~endDate` 안. 순서는 서버 정렬(`sort_order ASC`, [[api-db]]).
- **점 인디케이터는 우상단**(`#bannerDots`, 반투명 pill 안 흰 점, 현재 슬라이드 `.active`). 배너 **1개면 점 숨김**. **스와이프**(터치·마우스 드래그, `attachBannerSwipe`) + **점 클릭**으로 이동(`setBannerSlide`가 `translateX(-i*100%)`). 드래그 판정 시 이미지 링크 클릭 억제(`_bannerDragged`).
- "오늘 그만 보기"는 세트 전체 1회(`localStorage.bannerDismissedDate`, 기존 유지). 어드민 순서 설정은 [[admin]].
- **조기 노출(2026-09-24)**: 예전엔 `showBannerPopup`이 `await loadInitialData()`(매장 ~5MB 파싱+캠페인 타일 프리페치) **완료 뒤**에야 불려 팝업이 늦게 떴음 → **부팅 핸들러가 `initMap` 직후 작은 `/api/banners`만 독립적으로 먼저 fetch해 즉시 노출**(loadInitialData도 배너를 다시 채우지만 `_bannerShown` 가드로 중복 노출 안 함). 배너 GET은 payload가 큼(이미지 data URI, 2건 ~364KB)이라 공개 GET에 짧은 엣지캐시(60s)로 CDN 히트([[api-db]]).
  - **⚠️ 어드민 페이지 제외(2026-11-06)**: 이 조기노출 fetch는 **공개 `/api/banners`(숨김 제외)** 라, 어드민 페이지에서 그냥 돌면 `loadInitialData`가 `?admin=1`로 받은 **전체(숨김 포함) 전역 `banners`를 덮어써** 어드민 배너 목록(`renderBannerList`)에서 **과거 숨김/종료 배너가 사라지는** 버그가 있었음(레이스). → `if (!/^\/admin/.test(location.pathname))`로 가드(어드민은 이벤트 팝업을 띄우지도 않음). app.js의 `isAdminPage`는 `loadInitialData` 스코프 로컬이라 부팅 핸들러에선 경로를 다시 체크.

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
