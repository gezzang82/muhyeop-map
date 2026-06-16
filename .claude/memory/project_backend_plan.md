---
name: project_backend_plan
description: "무협맵 백엔드/DB 방향 — Vercel + Turso 확정, UI 확정 후 착수"
metadata: 
  node_type: memory
  type: project
  originSessionId: e8a1097c-da42-4fae-a4ab-38fdb20d6f48
---

무협맵 백엔드/DB 방향 (2026-06 기준 결정, 아직 착수 전).

- **호스팅**: Vercel 그대로 유지 (정적 프론트 + `/api/*` 서버리스 함수). Render는 안 씀 — 상시 구동 서버가 필요 없어서 불필요하다고 판단.
- **DB**: Turso (libSQL/SQLite) 사용. 읽기 위주 + 위치 기반 조회에 적합.
- **접근 방식**: 클라이언트에서 Turso 토큰 직접 노출 금지. Vercel Serverless Functions 경유로만 접근, 토큰은 Vercel 환경변수에 보관.
- **데이터 모델**: 현재 app.js의 `places` / `campaigns` 두 배열 구조를 테이블 2개(1:N)로 이전.
- **확장 시**: 지도 화면 영역(viewport bounds) 쿼리로 전환 (`WHERE lat BETWEEN ... AND lng BETWEEN ...`). 데이터 많아지면 lat/lng 인덱스 고려. 현재는 app.js에 데이터가 박혀 전부 로드하는 정적 구조.

**순서**: UI 확정이 먼저. DB 작업은 그 다음. 관련 [[project_muhyeop_map]].
