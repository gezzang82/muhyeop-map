# 무협맵 기획/전략 문서 (product docs)

무협맵의 **비즈니스·제품·전략** 문서 모음. 코드/기술 문서(`docs/*.md`: workflow·frontend·admin·api-db)와 분리해 여기서 관리한다.

## 목록

| # | 문서 | 내용 |
|---|------|------|
| 01 | [service-vision](01-service-vision.md) | 미션/비전/핵심가치 — **매장 중심** 서비스 지향 |
| 02 | [roadmap](02-roadmap.md) | Phase 1(지도 안정화·후기·필터) → 2(자동화·AI·알림) → 3(제휴·앱·수익화) |
| 03 | [platform-analysis](03-platform-analysis.md) | 협찬 플랫폼 우선순위(리뷰노트>디너의여왕>강남맛집…) + 분석 항목 |
| 04 | [revenue-model](04-revenue-model.md) | 제휴(CPA/CPC)·광고·프리미엄 노출·B2B 데이터 등 |
| 05 | [admin-spec](05-admin-spec.md) | 어드민 기능(매장·캠페인·후기 관리 + 향후 AI/자동수집) |
| 06 | [decision-log](06-decision-log.md) | **의사결정 기록** — 결정과 이유를 시간순으로 |
| 07 | [legal-review](07-legal-review.md) | 자동수집 약관·복제 지양·링크 중심·제휴 우선 |
| 08 | [partnership](08-partnership.md) | 제휴 대상/제안 가치 |
| 09 | [marketing](09-marketing.md) | 블로거 커뮤니티·SEO·SNS·제보자 배지 |
| 10 | [growth-strategy](10-growth-strategy.md) | 초기 수도권 데이터 → 장기 전국 DB |
| 11 | [competition](11-competition.md) | 경쟁사(콜라보매니저·리뷰플로우) vs 차별점 |
| 12 | [brand](12-brand.md) | 브랜드 소개/톤 |
| 13 | [ai-automation](13-ai-automation.md) | AI 활용(정제·분류·검증·중복·자동화 보조) |

## 관리 규칙

- 파일명: `NN-주제.md`(2자리 번호). 새 주제는 다음 번호로 추가하고 위 표에 한 줄 등록.
- **결정이 생기면 `06-decision-log.md`에 날짜와 이유를 남긴다** (가장 자주 갱신될 문서).
- 이 폴더는 **비즈니스/전략/기획**. 코드 구조·API·워크플로우 등 **기술 문서는 상위 `docs/`** 에 둔다.

## 기술 문서와 겹치는 부분 (참고)

세부 구현은 상위 `docs/`의 기술 문서를, 방향/전략은 여기를 본다.

- `05-admin-spec` ↔ `docs/admin.md`, `docs/admin-redesign.md`
- `03-platform-analysis` ↔ `docs/data-collection.md`
- `10-growth-strategy` ↔ `docs/growth-제보활성화.md`
