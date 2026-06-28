# API / 데이터베이스

## 구성
- Vercel 서버리스 함수 (`api/*.js`) + Turso(libSQL) — `api/_db.js`의 `getDb()`로 클라이언트 생성 (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 환경변수 필요)
- `schema.sql`: 테이블 정의 원본. 실제 운영 DB 스키마 변경은 각 API 핸들러 내 `ALTER TABLE ... ADD COLUMN` try/catch 패턴으로 점진 적용되는 경우가 있음 (예: `campaigns.js`의 `source` 컬럼)

## 엔드포인트
- `api/places.js` — 장소 CRUD
- `api/campaigns.js` — 협찬 캠페인 CRUD + 조회/클릭수 트래킹(`POST ?track=view|click&id=`). `view_count`/`click_count` 컬럼에 누적하며 `campaign_events(campaign_id, kind, visitor_key)` UNIQUE로 **IP+일자 기준 중복 제거**(클라이언트는 세션당 view 1회 디바운스). 표시는 아직 안 하고 데이터만 선누적(소급 불가). 함수 12개 제한 때문에 별도 엔드포인트 분리 없이 campaigns.js에 합침. `PATCH`는 두 갈래: 바디에 `platform` 없이 `hidden`만 오면 **hidden 토글만(부분 업데이트)** 처리(신고 목록의 캠페인 숨김/노출용), 그 외엔 전체 필드 수정.
- `api/reports.js` — 신고 처리 (`DELETE`는 단순 삭제만)
- `api/banners.js` — 상단 배너 관리
- `api/search-place.js` — 장소명 검색 (네이버 장소 검색 연동으로 추정, 협찬 제보하기 step1 매장명 검색에 사용)
- `api/users.js` — `GET`만 지원. 기본은 회원 전체 목록(어드민 회원 목록용, 이메일 포함), `?leaderboard=1` 쿼리 시 매장 등록 수 1위 회원의 닉네임/개수만 반환(공개 화면의 "제보왕" 배너용, PII 노출 없음). 별도 엔드포인트로 분리하지 않고 합친 이유는 Vercel Hobby 플랜의 서버리스 함수 12개 제한 때문 (아래 참고). **현재 공개 화면의 제보왕 배너는 `app.js`의 `LEADERBOARD_ENABLED=false` 플래그로 비노출 상태**(베타 이벤트 시작 시 true로) — API 자체는 살아있음.
- `api/auth/` — 카카오/네이버 간편로그인
  - `login.js` (`GET ?provider=kakao&redirectTo=...` → OAuth authorize URL로 302), `callback.js` (code 교환 → `users` upsert → 세션 쿠키 발급. **재로그인 시 OAuth 이메일이 비어있으면(카카오) 기존 `email`을 덮어쓰지 않고 보존** — '내 정보'에서 직접 넣은 이메일이 매 로그인마다 지워지지 않도록. 세션 쿠키 email도 DB의 유효 이메일로 발급), `logout.js`, `me.js` (현재 로그인 사용자 조회, DB에서 `url_platform`/`url_id` 조회해 함께 응답), `profile.js` (`POST`, 세션 필요 → `users.url_platform`/`url_id` **및 `email`** 갱신 + 세션 쿠키 email 재발급 — 추가정보입력/내정보 시트에서 이메일을 선택 입력받음. **특히 카카오는 OAuth 이메일이 비어 여기서 직접 수취**. 세션 email을 갱신해야 이후 제보/신고의 `founder_email`/`reporter_email` 자동입력이 따라옴), `delete-account.js` (`POST`, 세션 필요 → `users` row 삭제 + `campaigns.user_id`/`places.founder_user_id` NULL 처리 + 세션 쿠키 삭제)
  - `_session.js`/`_state.js`: Node 내장 `crypto` HMAC로 세션/CSRF state를 직접 서명 (jsonwebtoken 등 의존성 추가 없음). `SESSION_SECRET` 환경변수 필요. 세션 쿠키 payload에 `email`도 포함되어 있어, 로그인 사용자의 제보/신고 시 이메일을 매번 입력받지 않고 세션 값을 그대로 사용 (`api/campaigns.js`, `api/places.js`)
  - `_provider.js`: provider별 OAuth 설정(엔드포인트, clientId/secret, 프로필 파싱)을 모아둔 곳. 새 provider 추가 시 여기에 설정 객체만 추가. **현재 `parseProfile`이 수집하는 건 `providerUserId` + `nickname` + `email`뿐**(프로필 이미지·성별·나이 등은 수집/저장 안 함 — 개인정보 최소수집). 항목을 늘리려면 ① 카카오/네이버 콘솔의 동의항목(scope) 추가 ② `parseProfile`에 필드 추가 ③ `users` 테이블 컬럼 추가 ④ **개인정보처리방침(`policy/`) 갱신**이 한 세트로 필요
  - 세션 쿠키는 `HttpOnly; Secure; SameSite=Lax`. 로그인 사용자의 `reporter_nickname`/`founder_nickname`은 클라이언트 입력 대신 세션 닉네임을 우선 사용 (`api/campaigns.js`, `api/places.js`)

## 테이블 스키마 요약 (`schema.sql`)
- `users(id, provider, provider_user_id, nickname, email, url_platform, url_id, created_at)` — 카카오/네이버 로그인 사용자. `(provider, provider_user_id)` UNIQUE. `url_platform`/`url_id`는 프로필 설정에서 미리 등록해두는 블로그/인스타그램 링크(제보·신고 폼 자동입력용)
- `places(id, name, address, lat, lng, category, founder_nickname, founder_email, founder_url, founder_user_id, created_at)`
- `campaigns(id, place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source, hidden, user_id, created_at)`
  - `deadline`은 빈 문자열 허용(마감일 없음), `source`는 `'user'` 등으로 등록 경로 구분
  - `user_id`/`founder_user_id`는 로그인 사용자 식별용 nullable FK (`users.id`). 비로그인 제보도 계속 허용하므로 NULL 가능
- `banners(id, image_url, link_url, start_date, end_date, created_at)`
- `reports(id, campaign_id, reason, detail, user_id, created_at)` — `user_id`는 로그인 사용자가 신고 시 세션에서 조용히 채워짐(입력 필드 없음). 비로그인 신고는 NULL

## 데이터 매핑 규칙
- DB 컬럼은 snake_case, API 응답은 camelCase로 변환 (`toCampaign()`, `toPlace()` 같은 변환 함수가 각 핸들러 상단에 있음)

## ⚠️ 운영 DB 직결 주의
- 로컬 `vercel dev`도 동일한 운영 DB를 본다. [[workflow]] 문서의 DB 안전 규칙을 반드시 따른다.

## ⚠️ Vercel Hobby 플랜 서버리스 함수 12개 제한
- `api/` 디렉토리의 `*.js` 파일(`_`로 시작하는 헬퍼 제외) 하나당 서버리스 함수 1개로 카운트됨. Hobby 플랜은 배포당 최대 12개까지만 허용 (`vercel --prod` 시 13개째부터 `deploy_failed`로 배포 자체가 실패).
- 새 엔드포인트가 필요할 때는 새 파일을 만들기보다 **기존 파일에 쿼리 파라미터/메서드 분기로 합치는 것을 우선 검토**할 것 (예: `api/users.js`의 `?leaderboard=1` 분기).

## 시드 데이터
- `scripts/seed.js` — 초기 장소/캠페인 시드 스크립트
