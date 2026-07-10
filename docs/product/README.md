# 무협맵 기획/전략 문서 (product docs)

무협맵의 **비즈니스·제품·전략** 문서 모음. 코드/기술 문서(`docs/*.md`: workflow·frontend·admin·api-db)와 분리해 여기서 관리한다.

## 목록

| # | 문서 | 내용 |
|---|------|------|
| 01 | [service-vision](01-service-vision.md) | 미션/비전/핵심가치 — **매장 중심** 서비스 지향 |
| 02 | [roadmap](02-roadmap.md) | Phase 1(지도 안정화·후기·필터) → 2(자동화·AI·알림) → 3(제휴·앱·수익화) |
| 03 | [platform-analysis](03-platform-analysis.md) | 플랫폼 우선순위/분석 + **데이터 자동수집 구현 스펙**(구 data-collection 통합) |
| 04 | [revenue-model](04-revenue-model.md) | 제휴(CPA/CPC)·광고·프리미엄 노출·B2B 데이터 등 |
| 05 | [admin-spec](05-admin-spec.md) | 어드민 기능 + **개편 작업 명세**(구 admin-redesign 통합). 현 구현 기술문서는 `docs/admin.md` |
| 06 | [decision-log](06-decision-log.md) | **의사결정 기록** — 결정과 이유를 시간순으로 |
| 07 | [legal-review](07-legal-review.md) | 자동수집 약관·복제 지양·링크 중심·제휴 우선 |
| 08 | [partnership](08-partnership.md) | 제휴 대상/제안 가치 |
| 09 | [marketing](09-marketing.md) | 블로거 커뮤니티·SEO·SNS·제보자 배지 |
| 10 | [growth-strategy](10-growth-strategy.md) | 초기 수도권→장기 전국 DB + **제보 활성화 설계**(구 growth-제보활성화 통합) |
| 11 | [competition](11-competition.md) | 경쟁사(콜라보매니저·리뷰플로우) vs 차별점 |
| 12 | [brand](12-brand.md) | 브랜드 소개/톤 |
| 13 | [ai-automation](13-ai-automation.md) | AI 활용(정제·분류·검증·중복·자동화 보조) |

## 관리 규칙

- **대화(작업/논의)에서 정리·결정된 내용은 그때그때 해당 문서에 반영한다** — 결정은 `06-decision-log.md`(날짜+이유), 로드맵 변경은 `02-roadmap.md`, 수익/제휴/마케팅 등은 각 주제 문서로. (담당: 어시스턴트가 대화 맥락을 듣고 자동 갱신)
- 파일명: `NN-주제.md`(2자리 번호). 새 주제는 다음 번호로 추가하고 위 표에 한 줄 등록.
- **결정이 생기면 `06-decision-log.md`에 날짜와 이유를 남긴다** (가장 자주 갱신될 문서).
- 이 폴더는 **비즈니스/전략/기획**. 코드 구조·API·워크플로우 등 **기술 문서는 상위 `docs/`** 에 둔다.

## 기술 문서와의 관계

겹치던 상세 기획문서(data-collection·admin-redesign·growth-제보활성화)는 각각 03·05·10에 **통합**됨. 남은 관계:

- `05-admin-spec`(기획·개편 명세) ↔ `docs/admin.md`(현 어드민 **구현** 기술문서, 별도 유지)
- 그 외 순수 기술문서(`docs/workflow·frontend·api-db`)는 겹치지 않음.
