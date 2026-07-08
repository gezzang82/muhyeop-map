import UIKit
import WebKit
import Capacitor

// CAPBridgeViewController 서브클래스.
// 1) 왼쪽 가장자리 스와이프 뒤로가기 제스처 활성화.
// 2) 외부 페이지(네이버/카카오 OAuth 등)에서는 웹뷰를 상태바(세이프에어리어) 아래로 인셋시켜
//    그 페이지의 상단 UI(뒤로가기 버튼 등)가 상태바에 가려지지 않게 한다.
//    우리 페이지(muhyeop.com)는 그대로 edge-to-edge(지도가 상태바까지 확장) 유지.
class MainViewController: CAPBridgeViewController {
    private var urlObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let webView = self.webView else { return }
        webView.allowsBackForwardNavigationGestures = true
        // 웹뷰 문서 자체의 오버스크롤(러버밴드=아래로 내려갔다 올라옴) 제거.
        // 고정 지도 셸이라 문서 스크롤/바운스가 불필요(내부 리스트/모달 스크롤은 별개로 유지됨).
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        urlObservation = webView.observe(\.url, options: [.initial, .new]) { [weak self] wv, _ in
            self?.applyInsetForCurrentURL(wv)
        }
    }

    private func applyInsetForCurrentURL(_ webView: WKWebView) {
        let host = webView.url?.host ?? ""
        // 우리 도메인이거나 아직 로드 전(빈 host)이면 edge-to-edge, 그 외(OAuth 등)는 상태바 아래로 인셋
        let isOurs = host.isEmpty || host == "muhyeop.com" || host.hasSuffix(".muhyeop.com")
        webView.scrollView.contentInsetAdjustmentBehavior = isOurs ? .never : .always
    }
}
