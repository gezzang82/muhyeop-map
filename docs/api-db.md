# API / 데이터베이스

## 구성
- Vercel 서버리스 함수 (`api/*.js`) + Turso(libSQL) — `api/_db.js`의 `getDb()`로 클라이언트 생성 (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` 환경변수 필요)
- `schema.sql`: 테이블 정의 원본. 실제 운영 DB 스키마 변경은 각 API 핸들러 내 `ALTER TABLE ... ADD COLUMN` try/catch 패턴으로 점진 적용되는 경우가 있음 (예: `campaigns.js`의 `source` 컬럼)

## 엔드포인트
- `api/places.js` — 장소 CRUD
- `api/campaigns.js` — 협찬 캠페인 CRUD
- `api/reports.js` — 신고 처리 (`DELETE`는 단순 삭제만)
- `api/banners.js` — 상단 배너 관리
- `api/search-place.js` — 장소명 검색 (네이버 장소 검색 연동으로 추정, 협찬 제보하기 step1 매장명 검색에 사용)
- `api/auth/` — 카카오/네이버 간편로그인
  - `login.js` (`GET ?provider=kakao&redirectTo=...` → OAuth authorize URL로 302), `callback.js` (code 교환 → `users` upsert → 세션 쿠키 발급), `logout.js`, `me.js` (현재 로그인 사용자 조회), `delete-account.js` (`POST`, 세션 필요 → `users` row 삭제 + `campaigns.user_id`/`places.founder_user_id` NULL 처리 + 세션 쿠키 삭제)
  - `_session.js`/`_state.js`: Node 내장 `crypto` HMAC로 세션/CSRF state를 직접 서명 (jsonwebtoken 등 의존성 추가 없음). `SESSION_SECRET` 환경변수 필요
  - `_provider.js`: provider별 OAuth 설정(엔드포인트, clientId/secret, 프로필 파싱)을 모아둔 곳. 새 provider 추가 시 여기에 설정 객체만 추가
  - 세션 쿠키는 `HttpOnly; Secure; SameSite=Lax`. 로그인 사용자의 `reporter_nickname`/`founder_nickname`은 클라이언트 입력 대신 세션 닉네임을 우선 사용 (`api/campaigns.js`, `api/places.js`)

## 테이블 스키마 요약 (`schema.sql`)
- `users(id, provider, provider_user_id, nickname, email, created_at)` — 카카오/네이버 로그인 사용자. `(provider, provider_user_id)` UNIQUE
- `places(id, name, address, lat, lng, category, founder_nickname, founder_email, founder_url, founder_user_id, created_at)`
- `campaigns(id, place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source, hidden, user_id, created_at)`
  - `deadline`은 빈 문자열 허용(마감일 없음), `source`는 `'user'` 등으로 등록 경로 구분
  - `user_id`/`founder_user_id`는 로그인 사용자 식별용 nullable FK (`users.id`). 비로그인 제보도 계속 허용하므로 NULL 가능
- `banners(id, image_url, link_url, start_date, end_date, created_at)`
- `reports(id, campaign_id, reason, detail, created_at)`

## 데이터 매핑 규칙
- DB 컬럼은 snake_case, API 응답은 camelCase로 변환 (`toCampaign()`, `toPlace()` 같은 변환 함수가 각 핸들러 상단에 있음)

## ⚠️ 운영 DB 직결 주의
- 로컬 `vercel dev`도 동일한 운영 DB를 본다. [[workflow]] 문서의 DB 안전 규칙을 반드시 따른다.

## 시드 데이터
- `scripts/seed.js` — 초기 장소/캠페인 시드 스크립트
