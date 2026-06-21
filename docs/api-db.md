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

## 테이블 스키마 요약 (`schema.sql`)
- `places(id, name, address, lat, lng, category, founder_nickname, founder_email, founder_url, created_at)`
- `campaigns(id, place_id, platform, channels, content, deadline, link, operating_days, operating_hours, exclude_holiday, reporter_nickname, reporter_email, reporter_blog, reporter_instagram, reporter_url, source, hidden, created_at)`
  - `deadline`은 빈 문자열 허용(마감일 없음), `source`는 `'user'` 등으로 등록 경로 구분
- `banners(id, image_url, link_url, start_date, end_date, created_at)`
- `reports(id, campaign_id, reason, detail, created_at)`

## 데이터 매핑 규칙
- DB 컬럼은 snake_case, API 응답은 camelCase로 변환 (`toCampaign()`, `toPlace()` 같은 변환 함수가 각 핸들러 상단에 있음)

## ⚠️ 운영 DB 직결 주의
- 로컬 `vercel dev`도 동일한 운영 DB를 본다. [[workflow]] 문서의 DB 안전 규칙을 반드시 따른다.

## 시드 데이터
- `scripts/seed.js` — 초기 장소/캠페인 시드 스크립트
