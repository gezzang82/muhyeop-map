import UIKit
import WebKit
import Capacitor

// CAPBridgeViewController 서브클래스.
// 1) 왼쪽 가장자리 스와이프 뒤로가기 제스처 활성화.
// 2) 외부 페이지(네이버/카카오 OAuth 등)에서는 웹뷰를 상태바(세이프에어리어) 아래로 인셋시켜
//    그 페이지의 상단 UI(뒤로가기 버튼 등)가 상태바에 가려지지 않게 한다.
//    우리 페이지(muhyeop.com)는 그대로 edge-to-edge(지도가 상태바까지 확장) 유지.
// 3) 로그인 유지(2026-11-05): WKWebView가 앱 재실행 시 세션 쿠키(mhm_session)를 유실해 재로그인이
//    잦던 문제 → 쿠키를 Keychain에 미러 저장하고, 첫 로드 전에 재주입한다(아래 viewDidLoad / CookieSync).
class MainViewController: CAPBridgeViewController {
    private var urlObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        // ⚠️ super.viewDidLoad()를 호출하지 않는다 — CAPBridgeViewController.viewDidLoad()는 즉시
        //    loadWebView()로 muhyeop.com 첫 요청을 쏘는데, 그 전에 저장된 세션 쿠키(mhm_session)를
        //    WKHTTPCookieStore로 재주입해야 콜드스타트에서 '로그아웃으로 잠깐 떴다 로그인'되는 깜빡임을
        //    없앨 수 있다. 그래서 쿠키 복원이 끝난 뒤 우리가 직접 loadWebView()를 호출한다(로드 게이트).
        //    (CAPBridgeViewController.viewDidLoad의 유일한 동작은 super+loadWebView라 이것만 대체.)
        guard let webView = self.webView else { super.viewDidLoad(); return }
        webView.allowsBackForwardNavigationGestures = true
        // 웹뷰 문서 자체의 오버스크롤(러버밴드=아래로 내려갔다 올라옴) 제거.
        // 고정 지도 셸이라 문서 스크롤/바운스가 불필요(내부 리스트/모달 스크롤은 별개로 유지됨).
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        urlObservation = webView.observe(\.url, options: [.initial, .new]) { [weak self] wv, _ in
            self?.applyInsetForCurrentURL(wv)
        }
        let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
        CookieSync.startObserving(cookieStore)                 // 이후 쿠키 변경 → Keychain 미러
        CookieSync.restore(into: cookieStore) { [weak self] in // 저장된 세션 쿠키 재주입 → 그다음 로드
            self?.loadWebView()
        }
    }

    private func applyInsetForCurrentURL(_ webView: WKWebView) {
        let host = webView.url?.host ?? ""
        // 우리 도메인이거나 아직 로드 전(빈 host)이면 edge-to-edge, 그 외(OAuth 등)는 상태바 아래로 인셋
        let isOurs = host.isEmpty || host == "muhyeop.com" || host.hasSuffix(".muhyeop.com")
        webView.scrollView.contentInsetAdjustmentBehavior = isOurs ? .never : .always
    }
}

// MARK: - 로그인 유지: 세션 쿠키 Keychain 미러 + 재주입
// WKWebView(원격 server.url)의 쿠키 저장은 디스크 플러시가 비동기라 앱 종료/콜드스타트 때 세션 쿠키가
// 유실될 수 있다. 서버 슬라이딩 갱신(me가 매 호출 30일 재발급)은 "쿠키가 있을 때"만 유효하므로,
// 쿠키 자체를 네이티브(Keychain)에 영속하고 첫 로드 전에 재주입해 재로그인 빈도를 없앤다.
final class CookieSync: NSObject, WKHTTPCookieStoreObserver {
    static let shared = CookieSync()                 // store.add는 옵저버를 retain 안 함 → 싱글턴으로 생존
    private static let cookieName = "mhm_session"
    private static let keychainKey = "mhm_session_cookie_v1"

    // 쿠키 변경 감지 → 세션 쿠키를 Keychain에 미러링(로그인/슬라이딩갱신=저장, 로그아웃/만료=삭제).
    static func startObserving(_ store: WKHTTPCookieStore) {
        store.add(shared)
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        cookieStore.getAllCookies { cookies in
            if let c = cookies.first(where: { $0.name == CookieSync.cookieName }) {
                CookieSync.persist(c)
            } else {
                CookieSync.clear()   // 로그아웃/만료 → 저장분 제거
            }
        }
    }

    // 첫 로드 전: 저장된 세션 쿠키를 복원 주입한 뒤 completion(로드 트리거). 저장분 없으면 바로 completion.
    static func restore(into store: WKHTTPCookieStore, completion: @escaping () -> Void) {
        guard let cookie = loadPersisted() else { completion(); return }
        store.setCookie(cookie) { completion() }
    }

    // MARK: 직렬화(작은 JSON) — value/만료/도메인/경로만 보관(나머지는 재구성)
    private static func persist(_ c: HTTPCookie) {
        var dict: [String: Any] = [
            "name": c.name, "value": c.value,
            "domain": c.domain, "path": c.path,
            "secure": c.isSecure,
        ]
        if let exp = c.expiresDate { dict["expires"] = exp.timeIntervalSince1970 }
        guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }
        Keychain.set(data, for: keychainKey)
    }

    private static func loadPersisted() -> HTTPCookie? {
        guard let data = Keychain.get(keychainKey),
              let dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let value = dict["value"] as? String,
              let domain = dict["domain"] as? String,
              let path = dict["path"] as? String else { return nil }
        var props: [HTTPCookiePropertyKey: Any] = [
            .name: (dict["name"] as? String) ?? cookieName,
            .value: value, .domain: domain, .path: path,
        ]
        if (dict["secure"] as? Bool) == true { props[.secure] = "TRUE" }
        if let exp = dict["expires"] as? Double {
            let date = Date(timeIntervalSince1970: exp)
            if date <= Date() { clear(); return nil }   // 만료분은 폐기(30일 지난 접속 → 정상 재로그인)
            props[.expires] = date
        }
        return HTTPCookie(properties: props)
    }

    private static func clear() { Keychain.delete(keychainKey) }
}

// MARK: - Keychain 최소 래퍼(세션 쿠키 blob 저장)
enum Keychain {
    private static let service = "com.muhyeop.app.cookies"

    static func set(_ data: Data, for key: String) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock  // 첫 잠금해제 후 콜드스타트에서 접근 가능
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ key: String) -> Data? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    static func delete(_ key: String) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(q as CFDictionary)
    }
}
