# 앱 푸시 알림 설계 (재방문 엔진)

작성 2026-09-18 · 상태: **설계(미착수)** · 착수 시점: **안드로이드 Play 출시 후**

## 배경 / 문제
- 유입은 스레드/블로그로 늘지만(2026-09-17 UV 179), **기존 회원 재방문이 거의 없음**.
- 가입 회원의 **62%(18/29)가 딱 1번만 방문**하고 안 돌아옴. 오늘 로그인 6명 중 4명이 신규 = 진짜 재방문 ~2명(운영자 포함).
- **근본 원인**: 무협맵은 "1회성 발견 도구". 핵심 행동(신청·진행·후기)이 다 외부 플랫폼에서 일어나고, **돌아올 훅(알림·개인화·저장)이 없음**. 발견은 되는데 습관이 안 됨.
- **해결 1순위**: "내 관심지역에 새 협찬 뜨면 알려줌" = **재방문 + 가입 이유를 동시에** 만드는 알림.

## 방향 결정
- ❌ **실시간 GPS 지오펜싱**(위치 계속 추적→근처 가면 알림): 웹 불가, 앱도 "항상 위치 권한"+배터리 부담으로 비현실 → **접음**.
- ✅ **"저장한 관심 위치 기준" 알림**: 유저 위치를 한 번 저장 → 그 반경 안에 새 협찬 등록되면 발송. 당근 등 지역서비스 표준 방식.
- **채널**: 앱 네이티브 푸시(FCM/APNs)가 최적(오픈율↑, 안드 출시하면 바로). 대안=카톡 알림톡(오픈율 최고지만 폰번호+비즈채널+템플릿 승인), 이메일(지금 바로 되나 오픈율 낮음), 웹푸시(iOS 제약).

## 전체 구조 — FCM 하나로 iOS+안드로이드
```
[유저 폰(Capacitor 앱)]
  └ @capacitor/push-notifications → FCM 토큰 발급 → 서버에 토큰(+관심위치) 등록
[크롤러/서버]  새 협찬 감지 → push_prefs 조건 매칭 → FCM API 배치 발송
[유저 폰]  알림 수신 → 탭 → data.placeId로 focusPlace(해당 매장) 열림
```
FCM 하나면 안드로이드 + iOS(APNs 대행) 둘 다 커버 = Capacitor 표준.

## 데이터 모델 (테이블 2개)
```sql
-- 기기 푸시 토큰(로그인 안 해도 기기 단위)
push_tokens(
  id, user_id(nullable), device_id, platform('ios'|'android'),
  token UNIQUE, enabled(1/0), created_at, updated_at
)
-- 알림 타겟팅(위치 기준 — 콘텐츠 불문으로 유연)
push_prefs(
  device_id(or user_id), lat, lng, radius_km(기본 5),
  categories(nullable, 예 '숙박/여가,뷰티'),  -- 비우면 전체
  digest('instant'|'daily'), enabled, updated_at
)
```
→ **"무엇을 푸시할지"는 여기 조건(위치·카테고리)만 바꾸면 됨.** 발송 코드는 불변.

## 흐름 4단계
1. **토큰 등록** — 앱 시작 시 권한 요청 → FCM 토큰 → `POST /api/users?push=register {token, platform, deviceId, userId?}`
2. **관심위치 저장** — "이 동네 알림 받기" → `POST /api/users?push=prefs {lat, lng, radius, categories}`
3. **발송(트리거는 플러그)** — 새 협찬 등록 시(크롤러) 또는 하루 1회 요약: 좌표가 `push_prefs` 반경 안인 기기 조회 → FCM 배치 전송
4. **탭 처리** — 알림 `data:{placeId}` → 앱이 `focusPlace(placeId)`로 그 매장 오픈

## 네이티브 셋업 (1회)
- **Firebase 프로젝트** 생성 → `google-services.json`(안드) / iOS는 **APNs 인증키(.p8)를 Firebase에 업로드**
- `@capacitor/push-notifications` 설치 + `npx cap sync`
- iOS: Xcode **Push Notifications capability** 켜기 + Apple Developer APNs 키
- 안드: `google-services.json` 넣으면 FCM 자동

## API — ⚠️ Vercel 12함수 제한 대응
현재 `api/` 함수 12개(places·campaigns·reports·banners·users·search-place + auth 6개)로 **꽉 참 → 새 파일 금지**.
- **토큰/설정 등록** → `api/users.js`에 `?push=register`·`?push=prefs` 분기 추가(기존 파일 재사용)
- **발송** → **로컬 크롤러가 FCM으로 직접 전송**(이미 새 협찬 감지하며 도니 "매칭 기기에 푸시" 스텝만 추가). Vercel 엔드포인트 불필요 = 함수 안 늘어남.
- FCM 발송엔 **Firebase 서비스 계정 키**(서버 크리덴셜, env)가 필요.

## 권한 UX (승인율 핵심)
- 첫 실행에 바로 묻지 않기(승인율↓).
- **맥락에서 요청**: 유저가 지도 쓰다가 / "관심 동네 저장" 시 → *"○○동에 새 협찬 뜨면 알려드릴까요? 🔔"* → 그때 권한 팝업.

## "무엇을 푸시할지" = 트리거 (2026-09-21 결정: **하루 1회 요약**)
- **결정**: **하루 요약**으로 확정. 건당 즉시는 홍대처럼 협찬 쏟아지는 동네에서 하루 수십 번 = 스팸 → 알림 끔. 하루 1개면 피로 없이 재방문 유도.
- **구현**(`api/_push.js` `notifyDailyDigest`, 크롤러가 매 패스 호출): `PUSH_DIGEST_HOUR`(KST, 기본 12시) 이후 그날 처음이면, 각 기기 관심반경(+카테고리) 안 **지난 24h 신규 활성 협찬 수 N**을 세어 **"오늘의 새 협찬 🔔 · 근처 새 협찬 N개"** 1건 발송. 탭 시 data{lat,lng}로 그 지역 지도 이동. 1일1회 가드=`scrape_state 'push_digest'`(YYYYMMDD).
- **게이트**: `PUSH_SEND_ENABLED=1` + `FIREBASE_SERVICE_ACCOUNT` 있을 때만(기본 OFF).
- 향후 옵션(배관 불변): 마감임박("찜한 협찬 내일 마감"), 카테고리 세분, 발송 시각 조정(`PUSH_DIGEST_HOUR`).

## 착수 순서
1. **안드로이드 Play 출시 후**(앱이 스토어에 있어야 푸시 의미)
2. Firebase 셋업 + `@capacitor/push-notifications` + 토큰 등록(`users.js` 분기)
3. `push_tokens`/`push_prefs` 테이블 + 관심위치 저장 UI
4. 크롤러에 "새 협찬 → 매칭 기기 FCM 발송" 스텝
5. 콘텐츠(트리거) 확정 → 문구·주기 세팅

## 관련
- 리텐션 문제 배경: 방문 급증(스레드) 대비 재방문 부재 → [[10-growth-strategy]]
- 첫 유저 후기 등 참여 시작: [[06-decision-log]](2026-09-17)
