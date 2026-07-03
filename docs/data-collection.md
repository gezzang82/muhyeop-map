# 데이터 자동수집 — 어드민 통합 구현 스펙

협찬 플랫폼(1차: 디너의여왕)의 서울 최신 캠페인을 **증분 수집 → 규칙 검증 → 어드민 승인 → 매장/캠페인 등록**하는 워크플로. 이 문서는 새 세션이 바로 구현할 수 있게 스키마/API/UI/이식대상을 정의한다.

관련 배경·법적이슈: memory `project_scraping_plan`, `reference_platform_parsing`. 커밋 `49c1c1a`에 CLI 파일럿(`scripts/`) 있음.

---

## 0. 현재 완성된 것 (CLI 파일럿, `scripts/`)
전부 **결정적(regex/규칙) 코드, AI토큰 0**. 어드민 통합은 이 로직을 서버로 이식하는 것.
- `scrape-dinnerqueen.js` — robots 허용 범위 내 서울 최신 수집. 산출 필드: 매장명/주소/카테고리/채널/협찬내용/마감일/영업시간/가능요일 + 출처URL.
- `normalize-dinnerqueen.js` — 제외(배송형[랜덤픽]·비서울·주소없음), 카테고리 확정, 내용 아티팩트 정리, **채널별 개별 행**(디너의여왕은 채널마다 별도 캠페인).
- `dedupe-against-prod.js` — 운영 매장/캠페인과 대조. **활성 캠페인과 채널이 겹칠 때만 중복 제외, 만료분만 겹치면 갱신으로 유지.**

### 파싱 핵심 지식 (이식 시 그대로)
- **채널** = 상세 타이틀영역 아이콘 CSS 클래스: `sns-nv-blog`→블로그, `reels`(`qz_b_reels`/`dq_main_reels`)→릴스, `clip`→클립, `sns-ins`→인스타그램, `youtube`→유튜브. **og:title엔 블로그판만 채널 태그가 없음**(그래서 title 파싱만으로는 블로그가 미검출됨). **디너의여왕은 클립·블로그가 별도 캠페인**이고 클립 페이지가 블로그 아이콘도 노출하므로 `클립+블로그` 동시 검출 시 **클립만** 남긴다.
- **가능요일** = `영업요일(체험시간) − 체험불가요일`. 휴무일 필드만 보면 틀린다(예: 체험시간 `월~금`이면 휴무=일요일이어도 가능=월~금). 체험불가는 `★체험불가 : 월,금,토`(뒤) 와 `주말체험 불가`(앞) 양쪽에서 수집. 시간대 제한(`18시~20시 체험불가`)은 요일 차감 제외. `주말 이용 불가`·`주말 및 공휴일 체험불가`처럼 요일과 `불가` 사이 중간어(이용/및/체험)가 껴도 잡도록 `주말/평일` 보강 스캔 있음(`WEEKEND_CLOSE`).
  - ⚠️ **`공휴일`의 `일`을 일요일로 오독 금지**: 요일 계산 전 `공휴일`을 제거하고(`deriveDays` 앞부분) 공백 정리. 체험불가 마커 정규식엔 `(?<![가-힣])` lookbehind로 `공휴일`·`매일` 내부 `일`이 요일 시작으로 안 잡히게 함. 공휴일 자체의 Y/N은 아래 `공휴일불가`가 별도 처리.
- **공휴일불가(Y/N)** = `공휴일`이 **체험불가/휴무/제외 문맥**이면 `Y`, 영업(예: `토요일 및 공휴일 : 17:30~23:00`)이면 빈칸(N). `parseExcludeHoliday`가 `hours+휴무일`에서 판정. (쿠우쿠우 `주말, 공휴일 체험불가`→Y / 아리 `…및 공휴일 : 17:30~…`→N)
- **영업시간 표시**: 시간대 1개뿐이면 가능요일과 겹치는 요일표기 제거하고 시간만(키움참치 `주말,월요일 17:00~21:00`→`17:00~21:00`), 시간대 2개↑면 요일별 시간이 다르므로 원문 유지(목구멍 `월~목,일 …/금~토 …`). **요일/주말/공휴일 기반 체험불가·제외 문구는 표시에서 삭제**(`stripExclusionNotes`) — 가능요일·공휴일불가 컬럼과 중복이라. **시간기반(`18:00~20:00 체험불가`)·브레이크타임·피크타임 제외는 운영정보라 보존**. (예: `13:00-22:00 (★토,일/공휴일 체험불가)`→`13:00-22:00`, `화요일 금요일 토요일 체험불가`도 `요일` 접미 목록까지 인식)
- **회귀 테스트**: `deriveDays`/`cleanHours`/`parseExcludeHoliday`는 `module.exports`로 노출돼 있어 스크립트 없이 단위 테스트 가능(핵심 케이스 14종 통과 기준).
- **카테고리**: 디너의여왕 **자체 카테고리를 상세의 `ct=<한글>` 링크에서 읽음**(`parsePlatformCategory`, 채널/타입값 릴스·클립·블로그·기자단·페이백·맞춤·지역 제외 후 남는 맛집|뷰티|여가|배송). 무협맵 매핑(`mapCategory`): **맛집→음식점**(카페 키워드면 카페), **뷰티→뷰티**, **여가→문화 기본**(숙박류→숙박/여가, 헬스/PT·사주/타로→기타; 여가→문화는 검수플래그), **배송→기타(대개 제외)**. ⚠️ **숙박/여가 = "잠자는 곳"만**(호텔/펜션/글램핑/풀빌라/캠핑/리조트) — 워터파크·스파·파티룸은 숙박/여가 아님. 플랫폼 카테고리 없으면 키워드 fallback(기본 음식점+플래그). 특정 매장 예외는 `CATEGORY_OVERRIDE`(이름 기반) 최상위. **generic 단어(이용권·세트·체험권·코스·디너·런치·메뉴)는 음식점 키워드에서 제외**(비음식 매장 오분류 방지).
- **제외**: `[랜덤픽]`=배송형 상품(매장없음), region이 `서울`로 시작 안 하면 비서울, 방문위치·주석 둘 다 없으면 주소없음.
- **주소**: 본문 `방문 위치: <주소>` 1순위, HTML주석 상세주소 2순위(끝에 매장명 붙으면 제거).
- **마감일**: 신청기간 첫 셀 `26.07.03 – 26.07.09` → 종료일 `2026-07-09`.

---

## 1. 증분(Incremental) 수집
디너의여왕 캠페인 **id가 단조 증가**(최신=큰 id) → **`last_max_id` 커서**가 타임스탬프보다 정확(사이트가 신뢰할 updated_at을 안 줌).
- 수집 시: 서울 목록에서 id 수집 → `id > last_max_id`인 것만 상세 fetch·처리 → 처리 후 `last_max_id = max(발견한 모든 id)`.
- 최초 실행: 커서 null → 전량(현재 37). 이후엔 신규만이라 대개 소량 → 빠르고 서버부담↓.
- 멱등성: staging에 `UNIQUE(platform, source_id)` + `INSERT OR IGNORE`로 커서가 겹쳐도 중복 적재 안 됨.

---

## 2. DB 스키마 (신규 테이블 2개, `schema.sql` + 핸들러 내 `CREATE TABLE IF NOT EXISTS`)

```sql
-- 수집 스테이징 (승인 대기 큐)
CREATE TABLE IF NOT EXISTS scraped_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,              -- 'dinnerqueen'
  source_id INTEGER,                   -- 플랫폼 캠페인 id (커서/멱등키)
  source_url TEXT,
  name TEXT, address TEXT, category TEXT,
  channel TEXT,                        -- 단일(디너의여왕) or 콤마(다중지원 플랫폼)
  content TEXT, deadline TEXT,
  hours TEXT, days TEXT, exclude_holiday INTEGER DEFAULT 0,
  raw_json TEXT,                       -- 원본 파싱 전체(감사/재처리용)
  flags TEXT,                          -- 규칙검증 플래그(공백구분): '카테고리기본값' 등
  dedupe_status TEXT,                  -- new_place | add_channel | renew | dup_active
  matched_place_id INTEGER,            -- 기존 매장 매칭 시 그 place.id
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | registered
  created_campaign_id INTEGER,         -- 등록완료 시 생성된 campaign.id
  created_at TEXT DEFAULT (datetime('now','+9 hours')),
  reviewed_at TEXT,
  UNIQUE(platform, source_id)
);

-- 플랫폼별 커서 + 수집 이력
CREATE TABLE IF NOT EXISTS scrape_state (
  platform TEXT PRIMARY KEY,
  last_max_id INTEGER,
  last_run_at TEXT
);
CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  run_at TEXT DEFAULT (datetime('now','+9 hours')),
  cursor_from INTEGER, cursor_to INTEGER,
  fetched INTEGER,   -- 신규 후보 발견수
  staged INTEGER,    -- staging 적재수
  excluded INTEGER,  -- 제외수(비서울/배송형/dup_active 등)
  note TEXT
);
```

---

## 3. API — **새 파일 금지(함수 12개 상한), `api/campaigns.js`에 병합**
파싱/수집 로직은 `api/_scrape.js`(밑줄=함수 카운트 제외)로 이식하고 `campaigns.js`가 import. 모두 **requireAdmin**.

| 액션 | 메서드/쿼리 | 동작 |
|---|---|---|
| 수집 | `POST ?action=scrape&platform=dinnerqueen` | 증분 fetch→normalize→dedupe(DB 직접 대조)→`INSERT OR IGNORE` staging(status=pending)→`scrape_state`·`scrape_runs` 갱신. 반환 `{fetched, staged, excluded, cursorTo}` |
| 목록 | `GET ?action=staged&platform=&status=pending` | staging 조회(대시보드/승인대기/등록완료 공용) |
| 이력 | `GET ?action=runs&platform=` | `scrape_runs` 조회 |
| 상태변경 | `PATCH ?action=review&id=` body `{status, createdCampaignId?}` | pending→approved/rejected/registered, `reviewed_at` 기록 |

### ⚠️ 승인→등록의 geocode 처리
현재 어드민 엑셀 업로드는 **클라이언트에서 네이버 geocode**(`geocodeAddress` → `naver.maps.Service`) 후 POST. 서버 geocode 자격증명이 없으므로 **승인 버튼도 클라이언트에서 기존 `importExcelData` 코어 재사용**:
1. 승인 클릭 → (기존 매장 매칭 or geocode) → `POST /api/places`(신규 시) → `POST /api/campaigns`
2. 성공하면 `PATCH ?action=review&id=` 로 status=registered + createdCampaignId 기록
즉 서버 API는 staging CRUD만, **실제 매장/캠페인 생성은 클라 기존 경로 그대로**. (서버 함수 추가 최소화)

### 런타임 주의
- 상세 fetch에 저빈도 delay 유지(예의). 증분이라 평소 소량이지만 **최초 실행은 37건**이라 함수 실행시간 김 → delay를 짧게(~500ms)거나, 최초만 CLI로 시드하고 어드민은 증분만 담당하는 방안 검토.
- Vercel 함수 timeout 여유(기본 300s) 안에서 처리.

---

## 4. 어드민 UI — 새 탭 "데이터 수집"
`admin.html` 네비 탭 추가 + `admin.js` 렌더러. 기존 엑셀 프리뷰 UI(`renderExcelPreview`)·`importExcelData` 코어 재사용.

```
📂 데이터 수집 (tab-collect)
├── 플랫폼 선택      : select (dinnerqueen; 순차 확장). 커스텀셀렉트 패턴 재사용
├── [최신 캠페인 수집] : POST scrape → toast(신규 N건) → 승인대기 새로고침
├── AI 검증 결과     : 각 행 flags 배지(규칙검증, 0토큰). 예 '카테고리기본값' '요일확인'
├── 승인 대기        : status=pending 테이블. 행별 [승인][반려][수정(인라인)]
│                     dedupe_status 배지: new_place / +새채널 / 갱신 / (dup_active=회색·비활성+사유)
├── 등록 완료        : status=registered 목록(생성 campaign 링크)
└── 수집 이력        : scrape_runs (언제/커서/신규·제외 건수)
```
- 카테고리/채널/요일 편집은 엑셀 프리뷰의 셀렉트·체크칩 컴포넌트 재사용.
- 승인 = 위 3.승인→등록 흐름.

---

## 5. Phase 계획
- **Phase 1 (백엔드)**: 스키마 2테이블 + `api/_scrape.js` 이식 + `campaigns.js` `?action=scrape|staged|runs|review`. Playwright/CLI로 DB안전(mock) 검증.
- **Phase 2 (어드민 UI)**: "데이터 수집" 탭 6메뉴 + 승인→등록 클라 흐름(기존 import 재사용).
- **Phase 3 (확장)**: 강남맛집 등 파서 추가(`_scrape.js`에 플랫폼별 파서 모듈), 필요 시 애매 케이스만 선택적 LLM 검증.

---

## 6. 플랫폼 확장 가이드
`_scrape.js`에 플랫폼별 `{ listUrl, extractIds, cursorOf, parseDetail }` 모듈로 분리. 새 플랫폼 추가 시:
1. **robots.txt 확인**(서울오빠=`Disallow: /` 전면차단 → 제외한 실제 사례). 허용 SSR: 디너의여왕·강남맛집·서울오빠(robots막힘)·포블로그·링블·리뷰플레이스. 막힘/SPA: 리뷰노트·미블·레뷰·체험뷰.
2. ToS 확인(디너의여왕 9조 g=영리목적 이용 동의). 저빈도·사실필드·사람승인·출처링크백 유지. 장기=제휴.
3. 파서 작성 후 CLI로 소량 검증 → 어드민 연결.

## 7. 정책 주의 (매 플랫폼)
자동수집 정책은 플랫폼마다 다름. 기술적으로 증분이 최선이어도 **약관·데이터정책은 플랫폼별로 확인**. 사업 지속 관점에서 제휴가 안전한 경로.
