# 작업/배포 워크플로우

## ⚠️ DB 안전 규칙 (가장 중요)
`vercel dev --listen 3000 --yes`는 로컬 mock이 아니라 **실제 운영 Turso DB**에 직결된다.
- 등록/삭제/수정 등 쓰기 동작을 로컬에서 테스트할 때는 **반드시 `window.fetch`를 mock**한 뒤에 실행한다. mock 없이 실제 POST/PUT/DELETE를 실행하지 않는다.
- 안전장치(safety classifier)가 직접적인 쓰기성 호출을 막으면 절대 우회하지 않는다.

## 표준 작업 순서
1. 코드 수정 (app.js / admin.js / api / style.css 등)
2. `vercel dev --listen 3000 --yes`를 백그라운드로 실행 + Playwright MCP로 동작 확인
   - 쓰기 동작 테스트 시 위 DB 안전 규칙에 따라 `fetch` mock 필수
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
