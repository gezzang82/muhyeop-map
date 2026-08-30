# 플랫폼 분석

우선순위

1.  리뷰노트
2.  디너의여왕
3.  강남맛집
4.  레뷰
5.  미블

향후 항목 - 이용약관 - robots.txt - API - Open Graph - 제휴 가능성 -
크롤링 난이도

---

## 데이터 자동수집 — 구현 스펙

(구 `docs/data-collection.md` 통합)


협찬 플랫폼(1차: 디너의여왕)의 서울 최신 캠페인을 **증분 수집 → 규칙 검증 → 어드민 승인 → 매장/캠페인 등록**하는 워크플로. 이 문서는 새 세션이 바로 구현할 수 있게 스키마/API/UI/이식대상을 정의한다.

관련 배경·법적이슈: memory `project_scraping_plan`, `reference_platform_parsing`. 커밋 `49c1c1a`에 CLI 파일럿(`scripts/`) 있음.

---

## 0. 현재 완성된 것 (CLI 파일럿, `scripts/`)
전부 **결정적(regex/규칙) 코드, AI토큰 0**. 어드민 통합은 이 로직을 서버로 이식하는 것.
- `scrape-dinnerqueen.js` — robots 허용 범위 내 서울 최신 수집. 산출 필드: 매장명/주소/카테고리/채널/협찬내용/마감일/영업시간/가능요일 + 출처URL. 인자: 숫자=상세 수집 상한, `--all-seoul`=서울 17개 area2 소지역 순회+dedup(전체 `area2=전체`는 첫 렌더 ~37건만; 소지역 순회 시 ~450건 커버). 예 `node scripts/scrape-dinnerqueen.js --all-seoul 100`.
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

### ⚠️ 승인→등록의 geocode 처리 (2종)
- **수동 승인·엑셀 업로드**: 브라우저에서 네이버 geocode(`geocodeAddress` → `naver.maps.Service`) 후 `POST /api/places`(신규) → `POST /api/campaigns` → `PATCH ?action=review` status=registered. **승인 시 `source:'admin'`을 함께 보내 최초 제보자에 운영자 세션이 안 붙게 함**(2026-08-23 수정 — 이전엔 승인분이 운영자 닉네임으로 등록되던 버그).
- **오토파일럿(무인 크론)**: 브라우저가 없으므로 **서버 지오코딩**(`api/_geocode.js`, 네이버 로컬 검색 API의 `mapx/mapy` 재사용, 한국 좌표 범위 밖=실패→검수큐). 이후 매장/캠페인을 서버에서 직접 INSERT(제보자 비움, `campaigns.source='ai'`). ※ 과거 "서버 geocode 자격증명 없음" 서술은 이 서버 지오코딩 도입으로 해소됨.

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

---

## 8. AI 자동등록(오토파일럿) — 수동 승인 대체 (2026-08)
위 4~5절의 **수동 승인**을 AI가 대신하도록 확장. 매일 무인으로 수집→검수→등록하고 **애매한 것만 사람 검수큐**에 남긴다. 결정 [[06-decision-log]] 2026-08-21, AI 상세 `13-ai-automation`.

### 흐름 (로컬 크롤러 상시 — Vercel 크론 폐지 2026-08-30)
**로컬 크롤러(`scripts/crawl-worker.js`)로 단일화**. 컴퓨터가 켜진 동안 전 플랫폼(디너/강남/링블/포블로그/서울오빠/리뷰노트)을 순회 수집→오토파일럿. 과거 매일 06:00 KST Vercel 크론(`POST ?action=autopilot&scrape=dinnerqueen`)은 **①디너의여왕만 커버 ②컴퓨터가 켜진 06:00엔 로컬 크롤러와 겹쳐 오토파일럿 중복(같은 매장 2중 INSERT) 위험**이라 **폐지**([[06-decision-log]] 2026-08-30). 수동 트리거(`POST /api/campaigns?action=autopilot`, 어드민 [지금 실행]/[미리보기] 버튼, 인증=관리자)는 유지. 한 패스 안에서:
1. **수집 먼저** — 신규 캠페인을 긁어 큐(`scraped_items` pending)에 적재. 상한 `SCRAPE_MS=100s`(오토파일럿 시간 확보용).
2. **오토파일럿** — 방금 수집분 + 남은 백로그를 3갈래 라우팅(전체 예산까지)
   - 🟢 자동등록: 좌표OK·flags없음·마감유효 + (기존매장 추가/갱신 = 규칙만 / 신규매장 = AI 승인) → 매장·캠페인 INSERT(`source='ai'`, 제보자 비움), `status='registered'`
   - 🟡 검수대기: 좌표실패·파싱경고·중복의심·AI저신뢰 → `auto_seen=1`로 pending 유지 + `auto_note`(사유). 운영자가 기존 승인 UI에서 처리
   - 🔴 스킵: 마감 지남 등 → `status='rejected'`

### 처리량 — 로컬 크롤러 상시(무제한) (2026-08-30 갱신)
로컬 크롤러는 시간제한이 없어 컴퓨터가 켜진 동안 전 플랫폼을 **패스 반복**으로 소진한다(따라잡으면 10분 유휴 대기). 증분커서/`auto_seen`이 패스 간 이어받아 대량 백필도 여러 패스에 걸쳐 안전하게 처리(예: 포블로그 652건 백필, 4blog 레이트리밋 서킷브레이커로 패스당 ~120건). 서버(수동 autopilot 엔드포인트) 호출 시엔 여전히 **시간예산 방식**: `TOTAL=240s`(오토파일럿 150s 우선) 초과 시 중단, 다음 호출이 이어받음(`vercel.json functions.maxDuration=300`). 과거 Hobby 크론 1일 1회 상한(~150~200건)은 크론 폐지로 무의미.

### 스키마 추가 컬럼(`scraped_items`)
- `auto_seen INTEGER DEFAULT 0` — 1이면 오토파일럿 판정 완료(재평가 안 함)
- `auto_note TEXT` — 라우팅 사유(검수큐 표시용)

### 어드민
- "데이터 수집" 탭에 **AI 자동등록 카드**: [미리보기(등록 안 함, `?dry=1`)] / [지금 실행] + 결정 표(🟢/🟡/🔴)
- 승인 대기 검수열에 `auto_note` 사유 노출
- 조회 > 캠페인 출처 라디오에 **AI** 추가(=자동등록분 보기, 회수는 해당 행 관리)

### 필요 환경변수(운영자가 Vercel에 설정)
`OPENAI_API_KEY`(AI 판정). 선택 `OPENAI_MODEL`(기본 gpt-4o-mini). 로컬 크롤러는 `.env.local`의 Turso·`NAVER_SEARCH_*`(지오코딩)·`OPENAI_API_KEY` 사용. `CRON_SECRET`은 크론 폐지로 불필요(수동 autopilot 엔드포인트는 관리자 인증만으로 접근).

---

## 9. 강남맛집체험단 분석 (2026-08-28, 다음 확장 대상)

**사이트**: `강남맛집.net`(xn--939au0g4vj8sq.net), **그누보드 기반 SSR**. 이미지 도메인은 `gangnam-review.net`.
**robots.txt**: `User-agent: * / Allow: /`. 캠페인 상세 `/cp/?id=N` 접근 허용(/adm·/biz·/review·특정 1건만 Disallow). Sitemap 있음.
**약관**: 리뷰 저작권 회사귀속·자동수집 명시금지 없음 → 디너의여왕과 유사한 "관리 가능" 수준([07-legal-review](07-legal-review.md)). 저빈도·사실필드·링크백 유지.

### 파싱 구조 (파싱 가능)
캠페인 상세 `/cp/?id=N`이 `<dt>라벨</dt><dd>값</dd>` 정의목록. 주석(`<!-- -->`) 제거 후 dt/dd 추출. 확인된 필드:
- **[플레이스 URL]** = 네이버 플레이스 링크 → **매장명·좌표를 여기서 정확히 확보**(지오코딩 불필요, 디너의여왕보다 정확). 방문형(맛집)만 이 필드 있음.
- **[제품 URL]** = 배송형 제품(맛집 아님) → **스킵 대상**. (플레이스 URL vs 제품 URL로 방문형/배송형 구분)
- **[방문 및 예약]** dd에 주소 포함(예: "…서울 서초구 반포동 739-37 1층").
- **[캠페인 신청기간]** "08.25 ~ 08.31" → 마감일(종료일).
- [키워드](매장 관련 SEO 키워드)·[제공내역](혜택)·[가이드라인] 등.
- **⚠️ 요일/시간 전용 필드 없음**(예약 필수 안내만). "시간·요일 미표시가 많다"(운영자 확인). → **요일/시간은 비워서 등록**(오토파일럿이 이미 '요일 불확실→비움' 지원, 비필수 표시필드라 문제 없음).
- 채널: 블로그 중심 → 기본 블로그.
- og:title은 "강남맛집 체험단" 고정(매장명 없음) → 매장명은 플레이스 URL로.
- 고객센터 운영시간(am9~pm18)·약관·개인정보 보일러플레이트가 페이지에 섞여 있어 dt/dd로 실제 필드만 골라야 함.

### 지역 구조 (디너의여왕과 다름 — 통합 그룹)
`전체 지역` 탭: **서울**(하위 17: 홍대/마포·강남/논현·압구정/신사·구로/금천 등), **경기-인천**(전체·일산/파주·용인/성남/수원·안양/안산/광명·남양주/구리/하남·화성·인천/부천), **강원**(속초/양양/강릉·춘천/홍천/원주·기타), **대전-충청**(대전/세종·충청북도·충청남도), **대구-경북**(대구·경북), **부산-경남**(부산·울산·경남), **광주-전라**(광주·전라북도·전라남도), **제주**. → 스크래퍼 지역 매핑은 이 구조로.

### 구현 완료 (`runGangnam`, 2026-08-28) — 목록 1회로 전국 수집
**핵심 발견**: 목록 AJAX `POST /theme/go/_list_cmp_main.php`(`section=all&list_num=N`)의 카드(`<li class='list_item' data-product='ID'>`)에 필요한 게 다 있음 → **상세 fetch 불필요**:
- `data-product` = 캠페인 id, `<em class='type'>방문형/배송형` = 유형(방문형만 대상), `<em class='blog'>` = 채널(블로그/클립…)
- `<dt class='tit'>[인천 미추홀] 매장명` = 지역+매장명, `<dd class='sub_tit'>` = 제공내역, `class='day_c'>N일 남음` = 마감(오늘+N일)
- `list_num`이 개수 제어(500이면 500건). 페이지네이션 없이 큰 값 한 번으로 전국 커버(실측 490 방문형/17개 시도). 정렬이 마감임박순이라 id커서 대신 **`UNIQUE(platform,source_id)` + INSERT OR IGNORE로 멱등**.
- **구현**(`api/_scrape.js`): `gnFetchList`(목록 파싱)·`gnDeadline`(N일남음→날짜)·`runGangnam`. `runScrape`에 `platform='강남맛집'` 분기. 로컬 워커 pass 끝에 강남맛집 1회 추가.
- 좌표: scraped_items에 좌표 컬럼이 없어 **오토파일럿이 매장명+지역으로 지오코딩**(기존 파이프라인 재사용). 카테고리는 `categoryByKeyword`+AI 교정.

**v1 한계(개선 여지)**: ①주소가 지역태그(예: "인천 미추홀") 수준이라 일반적 매장명은 지오코딩 실패→검수 가능(온앤오프류). 정밀화하려면 상세의 [방문 및 예약] 주소나 **[플레이스 URL] naver.me→m.place.naver.com/restaurant/{id}로 매장명·정확좌표** 확보(상세 fetch 1회 추가). ②마감 근사(N일남음). ③상세에 있는 정확 주소·플레이스URL은 미사용.
- 참고: 상세 `/cp/?id=N`은 `<dt>라벨</dt><dd>값</dd>` 구조(주석 제거 후). naver.me는 리다이렉트 추적 시 `m.place.naver.com/restaurant/{placeId}`로 og:title(매장명)+좌표(x/y) 확보 가능(정밀화 시 사용).

## 10. 확장 후보 — 리뷰노마드 커버리지 전수 조사 (2026-08-30)

경쟁사 리뷰노마드([11-competition](11-competition.md))가 **~27개 플랫폼**을 집계 → 무협맵(현재 6개: 디너의여왕·강남맛집·리뷰노트·서울오빠·포블로그·링블)이 안 다루는 **21개의 무인증 파싱 가능성을 전수 조사**. 기준: ①로그인 없이 목록 접근 가능한가(**A**=SSR/`__NEXT_DATA__`, **B**=공개 JSON API, **C**=인증필요·불가) ②방문형+위치(매장 지도라 필수) ③파싱 난이도.

### 즉시 착수 (🟢 상 — 무인증·방문형·위치 확보) 12곳

| 플랫폼 | 도메인 | 접근 | 위치 정밀도 | 근거(엔드포인트) |
|---|---|---|---|---|
| **오마이블로그** | ohmyblog.co.kr | B 공개API | **전체주소** | `GET /api/web/campaign/active?page=&limit=`(무인증, total 397) + `/api/web/campaign/detail?app_seq=`(`com_address1`·방문시간·공휴일). 방문형 92%, 스키마 1:1 |
| **구구다스** | 99das.com | B 공개API | **주소+좌표** | `POST /amz/list/cmpnList.do`(`cmpnDcd=AMZ027.001`=방문형) + `/amz/cmpn/amzCmpnDtl.do?cmpnId=`(상세에 카카오맵 좌표 SSR → 지오코딩 불필요). 부산/경남 |
| **스토리앤미디** | storyn.kr(cafe24) | A SSR | **전체주소+네이버플레이스** | `review_campaign_list.php` + `review_campaign.php?cp_id=`. place id로 좌표 정확 |
| **리뷰플레이스** | reviewplace.co.kr | A SSR | **전체주소** | `/pr/?ct1=지역&ct2=방문형` + `/pr/?id=`(매장명·주소·네이버플레이스·마감). ~1,600건 |
| **아싸뷰** | assaview.co.kr | A SSR | 도로명주소 | `campaign_list.php?type=area`(방문형 탭) + `campaign.php?cp_id=` |
| **체험뷰** | chvu.co.kr | B 공개API | 지번주소 | `GET /v2/campaigns?category=search&page=N` + `/v2/campaigns/{id}`(`address1`). `activities=visit` 필터 |
| **포포몬** | popomon.com | B 공개API | 도로명주소 | `POST /api_p/campaign/fetch_getcampaignlist?recruitType=visiting` + detail. 부산 소재 |
| **놀러와체험단** | cometoplay.kr | A SSR(gnuboard) | 전체주소(좌표X) | `item_list.php?category_id=001` + `item.php?it_id=`. 지오코딩 필요 |
| **데일리뷰** | dailyview.kr | A SSR(PHP) | 시/구(지오코딩) | `review_campaign_list.php?category_id=001A`(방문형: 맛집/뷰티/숙박) + `review_campaign.php?cp_id=` |
| **클립뷰** | 클립뷰.kr(`xn--5y2bw0fi0u.kr`) | A SSR(PHP) | 시/구(상세 도로명) | `cv_campaign_list.php?category_id=001A`(방문형) + `cv_campaign.php?cp_id=` |
| **티블** | tble.kr | A SSR(PHP) | 시/구(지오코딩) | `category.php?type=l&ca=맛집` + `view.php?cp_id=`. 방문형 물량 많음, 프랜차이즈 오매칭 주의 |
| **리뷰진** | reviewjin.com | B 공개API | 도로명주소 | **`POST /`(호스트 루트 RPC)** body `{cat:'campaign',cmd:'campaign_list',page,amount}`→JSON(`upjang_name`·`road_addr`). ⚠️`/api/campaigns`는 SPA HTML 폴백이라 함정. 활성 ~39건 소규모 |

### 조건부 (🟡 중) 4곳

| 플랫폼 | 접근 | 제약 |
|---|---|---|
| **클라우드리뷰**(cloudreview.co.kr) | A SSR·지역필터 | 정확 매장명·주소가 **로그인 게이트**(시/군/구 근사만) |
| **가보자체험단**(`xn--o39a04kpnjo4k9hgflp.com`) | 상세=A SSR(전체주소+좌표링크) | **목록이 JS렌더** → 목록 API 발굴/ID 순회 필요 |
| **체험단닷컴**(chehumdan.com) | A SSR | 방문형/재택 혼재, 상세 주소 정밀도 미검증 |
| **후기업**(whogiup.com) | B(대표 캠페인만) | `POST /api/mainPageBest` 무인증(주소·전화 완비)이나 **전체목록 `/api/campList`는 401** |

### 제휴/제외 (🔴 하) 5곳

| 플랫폼 | 사유 |
|---|---|
| **레뷰(REVU)**(revu.net) | 최대어(월 ~1.5만건)지만 **OAuth 인증벽**(`api.weble.net`→401), SSR/임베드JSON 없음 → **제휴만** |
| **미블(MRBLE)**(mrblog.net) | 전 라우트 Laravel **로그인 게이트**(302→/login) → 제휴/보류 |
| **파인앳플**(fineadple.com) | **2026-06-30 서비스 종료** |
| **블로그원정대** | 도메인 폐쇄(NXDOMAIN), 후속 리뷰원정대.com도 방문형 재고 0 |
| **리뷰조아** | 체험단 웹 소스 없음(검색 도메인은 판촉물 쇼핑몰), 앱 전용 추정 |

### 착수 우선순위 & 시사점
1. **최우선 4곳(공개API·주소/좌표 완비, 유지보수 최소)**: 오마이블로그 → 구구다스 → 스토리앤미디 → 리뷰플레이스. 좌표/전체주소가 있어 지오코딩 부담 적음.
2. 그다음 **SSR+지오코딩군**: 아싸뷰·체험뷰·포포몬·놀러와·데일리뷰·클립뷰·티블 (기존 링블/서울오빠와 동일 패턴, `api/_geocode.js` NCP 경유).
3. **레뷰·미블(최대형)은 인증벽** → 스크래핑 불가, 장기 **제휴 트랙**. 경쟁사도 이 둘은 정식 수집이 아닐 가능성.
4. **효과**: 상 12곳 추가 시 무협맵 6→**~18개** → 리뷰노마드(27)와 커버리지 격차 대부분 해소.
5. 각 소스마다 **robots/약관 확인 + `07-legal-review` 기조**(사실필드·원문 미복제·자체 지오코딩·링크백) 동일 적용. 구현은 `api/_scrape.js`에 `runXxx` 러너 추가 + `runScrape` 분기(기존 6개와 동일 구조), 오토파일럿·중복방지·검수큐 인프라 재사용.
6. 비공식 내부 API(`/api_p/`·`/v2/`·`cmpnList.do`·`POST /`)는 스키마 변경·차단 가능 → 보수적 파싱 + fail-safe.
