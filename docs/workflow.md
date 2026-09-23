# 작업/배포 워크플로우

## ⚠️ DB 안전 규칙 (가장 중요)
**로컬 dev DB 분리(2026-09-24)**: 이제 `vercel dev`는 운영 Turso가 아니라 **로컬 `dev.db`(SQLite file)** 를 본다 → 로컬 쓰기 테스트(제보·신고·후기·어드민 승인 등)에 **더 이상 `fetch` mock 불필요**(dev.db라 운영과 완전 분리).
- **설정**: `.env.local`의 `TURSO_DATABASE_URL=file:./dev.db` + **Vercel의 Development 스코프** `TURSO_DATABASE_URL`도 `file:./dev.db`. ⚠️ **Development 스코프가 핵심** — Vercel 환경변수가 `.env.local`보다 우선이라, 이걸 안 바꾸면 `vercel dev`가 계속 운영을 본다. 운영 URL/토큰은 `.env.local`에 `TURSO_PROD_URL`/`TURSO_PROD_AUTH_TOKEN`로 백업.
- **배포는 영향 없음**: `vercel --prod`는 Vercel **Production 스코프(운영 DB)** 를 쓰므로 배포는 운영 그대로.
- **유지보수 스크립트가 운영을 대상으로 해야 하면** `TURSO_PROD_*`를 읽어야 한다(그냥 `TURSO_DATABASE_URL`을 쓰면 `dev.db`를 건드림).
- `scripts/seed-dev-db.js`: 운영에서 샘플(매장 6천·캠페인·배너·후기 일부) 복사해 `dev.db` 생성. 스키마 드리프트 자동보정(누락 컬럼 `ALTER`), 소스는 `TURSO_PROD_*` 우선. dev 데이터 새로고침 시 재실행.
- `dev.db`는 gitignore(커밋 금지). dev.db엔 `users`/`site_daily`/`campaign_events`/`reports`/`scraped_items`/`push_tokens`는 비어있음(그 어드민 화면 테스트하려면 시드에 추가 필요).
- **여전히 유효**: `.env.local` 보호 훅(쓰기 차단), 안전장치가 막으면 **우회 금지**, 운영을 직접 건드리는 스크립트(`TURSO_PROD_*` 사용분)는 항상 주의.

## 표준 작업 순서
1. 코드 수정 (app.js / admin.js / api / style.css 등)
2. `vercel dev --listen 3000 --yes`를 백그라운드로 실행 + Playwright MCP로 동작 확인
   - `vercel dev`는 로컬 `dev.db`를 보므로 쓰기 테스트도 자유롭게(운영 무관). `fetch` mock 불필요. (`/admin`은 로컬에서 404 → `/admin.html`로 접속)
3. 테스트 산출물 정리: 스크린샷 삭제, `.playwright-mcp` 디렉토리 삭제, `lsof -ti:3000 | xargs -r kill -9`로 dev 서버 종료
4. `git add <구체적 파일명>` — **`git add -A`/`git add .` 금지**, 항상 파일을 지정해서 add
5. 커밋 메시지는 한국어로, 마지막 줄에 아래를 포함:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```
6. `git push`
7. `vercel --prod --yes`로 배포

## 커밋 관련 규칙
- 매번 새 커밋을 생성 (amend는 사용자가 명시적으로 요청한 경우만)
- `--no-verify`, `--no-gpg-sign` 등 훅/서명 우회 금지
- 사용자가 명시적으로 요청하기 전에는 커밋하지 않음

## Figma 연동
- 디자인 비교/구현 시 `mcp__claude_ai_Figma__get_design_context` 등 Figma MCP 도구로 스펙 확인 후 코드에 반영
- 이 프로젝트의 Figma fileKey: `uJ3fozx2Ev3p5xNUS6dLl7`

## 자주 겪는 CSS 함정
- flex 컨테이너에 `gap`이 있으면 자식의 `margin-top`은 gap에 **더해진다** (대체가 아님). 간격 버그의 흔한 원인.
- 검색 결과 리스트류는 `:empty`/`:not(:empty)` 가상클래스로 "내용 있을 때만 간격/표시"를 처리 (JS로 display 토글하지 않음). 관련 클래스: `.place-results-list` (신고하기 `#reportResultsList`, 협찬 제보하기 `#placeResultsList` 공통 적용).
