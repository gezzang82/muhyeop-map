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

    // 앱-타깃 커스텀 플러그인은 자동발견 안 됨(Capacitor 6+) → 여기서 명시 등록. (CustomBrowser: 앱-스킴 조용히 취소 인앱브라우저, 아래)
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CustomBrowserPlugin())
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

// MARK: - 외부 플랫폼 로그인 유지: CustomBrowser 쿠키 스냅샷/복원 (2026-11-12)
// 레뷰/리뷰노트/강남맛집 등 외부 플랫폼은 세션 쿠키(만료 없음)로 로그인을 유지하는데, WKWebView는
// 앱 종료 시 세션 쿠키를 디스크에 영속하지 않아 "앱 종료 후 재진입"마다 재로그인 화면이 떴다(제보).
// → 브라우저가 페이지를 다 읽을/닫을/백그라운드 갈 때 (muhyeop 제외) 전 쿠키를 Keychain에 스냅샷하고,
//   다음에 열 때 '로드 전' 복원 주입한다(세션 쿠키도 살아 재로그인 사라짐). 우리 도메인은 CookieSync가 담당.
enum ExtCookieJar {
    private static let key = "ext_cookies_v1"
    private static func isOurs(_ domain: String) -> Bool {
        let d = domain.hasPrefix(".") ? String(domain.dropFirst()) : domain
        return d == "muhyeop.com" || d.hasSuffix(".muhyeop.com")
    }
    // 저장소의 외부 쿠키 전부(세션 포함)를 Keychain에 영속(전체 blob 교체 → 사이트 로그아웃도 반영).
    static func snapshot(_ store: WKHTTPCookieStore) {
        store.getAllCookies { cookies in
            var arr: [[String: Any]] = []
            for c in cookies where !isOurs(c.domain) {
                var d: [String: Any] = [
                    "name": c.name, "value": c.value, "domain": c.domain,
                    "path": c.path, "secure": c.isSecure,
                ]
                if let exp = c.expiresDate { d["expires"] = exp.timeIntervalSince1970 }
                arr.append(d)
            }
            guard let data = try? JSONSerialization.data(withJSONObject: arr) else { return }
            Keychain.set(data, for: key)
        }
    }
    // 저장분을 저장소에 복원 주입한 뒤 completion(로드 트리거). 없으면 즉시 completion.
    static func restore(into store: WKHTTPCookieStore, completion: @escaping () -> Void) {
        guard let data = Keychain.get(key),
              let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
              !arr.isEmpty else { completion(); return }
        let group = DispatchGroup()
        for d in arr {
            guard let name = d["name"] as? String, let value = d["value"] as? String,
                  let domain = d["domain"] as? String, let path = d["path"] as? String else { continue }
            var props: [HTTPCookiePropertyKey: Any] = [
                .name: name, .value: value, .domain: domain, .path: path,
            ]
            if (d["secure"] as? Bool) == true { props[.secure] = "TRUE" }
            if let exp = d["expires"] as? Double {
                let date = Date(timeIntervalSince1970: exp)
                if date <= Date() { continue }   // 만료분 스킵
                props[.expires] = date
            }
            guard let cookie = HTTPCookie(properties: props) else { continue }
            group.enter()
            store.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) { completion() }
    }
}

// MARK: - 커스텀 인앱브라우저 (2026-11-08)
// @capacitor/inappbrowser는 커스텀 앱 스킴(revu:// 등)을 .allow 해버려 WKWebView 로드 실패→"Couldn't load" 에러가 떴다.
// 이 플러그인은 decidePolicyFor에서 **앱 스킴을 조용히 .cancel**(앱 열기/팝업/에러 없이 현재 웹페이지 유지) + http(s)만 로드.
// JS: window.Capacitor.Plugins.CustomBrowser.open({ url }) — app.js openExternal가 우선 사용. (pbxproj 수술 피하려 MainViewController.swift에 합침)
@objc(CustomBrowserPlugin)
public class CustomBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CustomBrowserPlugin"
    public let jsName = "CustomBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("invalid url"); return
        }
        DispatchQueue.main.async {
            let vc = CustomBrowserViewController(url: url)
            let nav = UINavigationController(rootViewController: vc)
            nav.modalPresentationStyle = .fullScreen
            self.bridge?.viewController?.present(nav, animated: true, completion: nil)
            call.resolve()
        }
    }
}

class CustomBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let initialURL: URL
    private var webView: WKWebView!
    private var bottomBar: UIView!   // 하단 세이프에어리어(홈 인디케이터) 전용 색 영역

    init(url: URL) { self.initialURL = url; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()   // 영구 저장소 → revu 등 로그인(영구 쿠키) 유지
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            // 바닥을 세이프에어리어까지만(홈 인디케이터 영역은 네이티브 여백) → 페이지 하단 버튼이 끝에 딱 붙어 답답하던 것 해소
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        // 하단 세이프에어리어 전용 색 영역(여기만 칠함 → 상단 툴바는 흰색 유지). 기본 흰색, 페이지 하단 버튼색 감지해 매칭(아래 syncBottomColor)
        bottomBar = UIView()
        bottomBar.backgroundColor = .systemBackground
        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bottomBar)
        NSLayoutConstraint.activate([
            bottomBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "닫기", style: .plain, target: self, action: #selector(closeTapped))
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reloadTapped))
        navigationItem.title = initialURL.host

        // 백그라운드 전환 시(앱이 곧 kill될 수 있음) 외부 로그인 쿠키를 즉시 스냅샷
        NotificationCenter.default.addObserver(self, selector: #selector(appBackgrounded),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)

        // 저장된 외부 플랫폼 쿠키(세션 포함)를 '로드 전' 복원 주입한 뒤 로드 → 재로그인 방지
        ExtCookieJar.restore(into: webView.configuration.websiteDataStore.httpCookieStore) { [weak self] in
            guard let self = self else { return }
            self.webView.load(URLRequest(url: self.initialURL))
        }
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func appBackgrounded() {
        ExtCookieJar.snapshot(webView.configuration.websiteDataStore.httpCookieStore)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        ExtCookieJar.snapshot(webView.configuration.websiteDataStore.httpCookieStore)   // 브라우저 닫힐 때 최종 스냅샷
    }

    @objc private func closeTapped() { dismiss(animated: true, completion: nil) }
    @objc private func reloadTapped() { webView.reload() }

    // 스킴 분기: http(s)=로드 / tel·mailto 등=시스템 / 그 외 앱 스킴(revu:// 등)=조용히 취소(팝업·에러 없이 현재 페이지 유지)
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            decisionHandler(.allow); return
        }
        if scheme == "http" || scheme == "https" || scheme == "about" {
            if navigationAction.targetFrame == nil {   // target=_blank → 현재 웹뷰에서 로드
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
            return
        }
        if ["tel", "mailto", "sms", "facetime", "itms-apps", "itms-appss", "maps"].contains(scheme) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)   // 전화·메일·앱스토어 등은 시스템에
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.cancel)   // revu:// 등 커스텀 앱 스킴 → 조용히 무시(웹페이지 유지)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        navigationItem.title = webView.url?.host ?? initialURL.host
        syncBottomColor()
        // 레이아웃/하단 버튼이 늦게 잡히는 페이지 대비 한 번 더
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in self?.syncBottomColor() }
        // 페이지 로드 완료 = 로그인/쿠키 세팅 직후일 수 있음 → 외부 쿠키 스냅샷(사이트 로그아웃도 반영)
        ExtCookieJar.snapshot(webView.configuration.websiteDataStore.httpCookieStore)
    }

    // 페이지 하단(고정 버튼 등) 배경색을 감지해 하단 네이티브 여백 색을 맞춘다(강남맛집=주황 등 플랫폼 자동 대응)
    private func syncBottomColor() {
        let js = "(function(){try{var el=document.elementFromPoint(Math.round(window.innerWidth/2), window.innerHeight-2);var i=0;while(el&&i<6){var bg=getComputedStyle(el).backgroundColor;if(bg&&bg.indexOf('rgba(0, 0, 0, 0)')<0&&bg!=='transparent'){return bg;}el=el.parentElement;i++;}}catch(e){}return '';})()"
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self = self else { return }
            if let rgb = result as? String, let color = Self.colorFromCSS(rgb) {
                self.bottomBar.backgroundColor = color   // 하단 영역만 칠함(상단 툴바 영향 없음)
            } else {
                self.bottomBar.backgroundColor = .systemBackground
            }
        }
    }

    // "rgb(r, g, b)" / "rgba(r, g, b, a)" → UIColor
    private static func colorFromCSS(_ s: String) -> UIColor? {
        guard let open = s.firstIndex(of: "("), let close = s.firstIndex(of: ")") else { return nil }
        let inner = s[s.index(after: open)..<close]
        let parts = inner.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count >= 3, let r = Double(parts[0]), let g = Double(parts[1]), let b = Double(parts[2]) else { return nil }
        let a = parts.count >= 4 ? (Double(parts[3]) ?? 1) : 1
        if a < 0.05 { return nil }   // 투명이면 기본색 사용
        return UIColor(red: r/255, green: g/255, blue: b/255, alpha: 1)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "http" || scheme == "https" { webView.load(navigationAction.request) }
        }
        return nil
    }
}
