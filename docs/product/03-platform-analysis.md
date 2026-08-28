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

### 흐름 (매일 06:00 KST 크론 1회)
`vercel.json` 크론 → `POST /api/campaigns?action=autopilot&scrape=dinnerqueen` (인증: `CRON_SECRET` 헤더 or 관리자). 한 실행 안에서(2026-08-24 순서 변경 — [[06-decision-log]]):
1. **수집 먼저** — 신규 캠페인을 긁어 큐(`scraped_items` pending)에 적재. 상한 `SCRAPE_MS=100s`(오토파일럿 시간 확보용).
2. **오토파일럿** — 방금 수집분 + 남은 백로그를 3갈래 라우팅(전체 예산까지)
   - 🟢 자동등록: 좌표OK·flags없음·마감유효 + (기존매장 추가/갱신 = 규칙만 / 신규매장 = AI 승인) → 매장·캠페인 INSERT(`source='ai'`, 제보자 비움), `status='registered'`
   - 🟡 검수대기: 좌표실패·파싱경고·중복의심·AI저신뢰 → `auto_seen=1`로 pending 유지 + `auto_note`(사유). 운영자가 기존 승인 UI에서 처리
   - 🔴 스킵: 마감 지남 등 → `status='rejected'`

### 처리량 — Hobby 하루 1회 시간예산 (2026-08-21)
디너의여왕은 신규가 D-6로 올라오고 **평일 수백 건**(주말 거의 없음). Hobby(크론 1일 1회·함수 300초)에선 상세 1건당 0.6초 예의 딜레이라 한 실행 현실 상한 ~150~200건. → **시간예산 방식**: `TOTAL=240s`(오토파일럿 150s 우선 배정) 초과 시 각 단계 중단, 못한 건은 **증분커서/`auto_seen`이 다음 실행에서 이어받음**(중단돼도 안전). `vercel.json functions.maxDuration=300`. 더 늘리려면 Vercel Pro(하루 여러 번).

### 스키마 추가 컬럼(`scraped_items`)
- `auto_seen INTEGER DEFAULT 0` — 1이면 오토파일럿 판정 완료(재평가 안 함)
- `auto_note TEXT` — 라우팅 사유(검수큐 표시용)

### 어드민
- "데이터 수집" 탭에 **AI 자동등록 카드**: [미리보기(등록 안 함, `?dry=1`)] / [지금 실행] + 결정 표(🟢/🟡/🔴)
- 승인 대기 검수열에 `auto_note` 사유 노출
- 조회 > 캠페인 출처 라디오에 **AI** 추가(=자동등록분 보기, 회수는 해당 행 관리)

### 필요 환경변수(운영자가 Vercel에 설정)
`OPENAI_API_KEY`(AI 판정), `CRON_SECRET`(크론 인증). 선택 `OPENAI_MODEL`(기본 gpt-4o-mini).

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

### 구현 계획 (`runGangnam` 파서만 추가, 인프라 재사용)
1. 목록/페이지네이션에서 `/cp/?id=N` 수집(커서·robots 저빈도).
2. 상세 파싱: dt/dd → [플레이스 URL] 있으면 방문형(대상), [제품 URL]이면 배송형(스킵).
3. 플레이스 URL → 네이버 플레이스로 매장명·좌표. 주소=[방문 및 예약], 마감=[신청기간] 종료일, 제공내역=혜택, 요일/시간=비움, 채널=블로그.
4. 기존 오토파일럿·중복방지(이름+좌표/링크)·AI검증·검수큐 그대로 재사용.
- 남은 확인: 목록 페이지네이션 방식, 플레이스 URL 파싱(네이버 place id 추출), 지역 필터 URL 파라미터.
