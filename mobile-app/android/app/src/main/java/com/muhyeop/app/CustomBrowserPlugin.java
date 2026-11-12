package com.muhyeop.app;

import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 커스텀 인앱브라우저 (2026-11-08) — iOS CustomBrowserPlugin(Swift)의 안드 대응.
// WebViewClient.shouldOverrideUrlLoading에서 revu:// 등 커스텀 앱 스킴을 **조용히 차단**(인텐트 실행/에러 없이) + http(s)만 로드.
// JS: window.Capacitor.Plugins.CustomBrowser.open({ url }).
@CapacitorPlugin(name = "CustomBrowser")
public class CustomBrowserPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("invalid url"); return; }
        getActivity().runOnUiThread(() -> {
            try { showBrowser(url); call.resolve(); }
            catch (Exception e) { call.reject("open failed", e); }
        });
    }

    private int dp(int v) {
        return Math.round(v * getActivity().getResources().getDisplayMetrics().density);
    }

    private void showBrowser(final String url) {
        final Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout root = new LinearLayout(getActivity());
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setFitsSystemWindows(true);

        // 상단 바: 닫기 / 도메인 / 새로고침
        LinearLayout bar = new LinearLayout(getActivity());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int pad = dp(8);
        bar.setPadding(pad, pad, pad, pad);
        bar.setBackgroundColor(Color.WHITE);

        Button close = new Button(getActivity());
        close.setText("닫기");
        close.setTextColor(Color.BLACK);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setAllCaps(false);
        close.setTextSize(16);
        close.setPadding(dp(4), 0, dp(4), 0);
        close.setMinWidth(0); close.setMinimumWidth(0);

        TextView title = new TextView(getActivity());
        try { title.setText(Uri.parse(url).getHost()); } catch (Exception ignored) {}
        title.setTextColor(Color.BLACK);
        title.setGravity(Gravity.CENTER);
        title.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button refresh = new Button(getActivity());
        refresh.setText("↻"); // ↻
        refresh.setTextColor(Color.BLACK);
        refresh.setBackgroundColor(Color.TRANSPARENT);
        refresh.setAllCaps(false);
        refresh.setTextSize(24);
        refresh.setPadding(dp(4), 0, dp(4), 0);
        refresh.setMinWidth(0); refresh.setMinimumWidth(0);

        final WebView webView = new WebView(getActivity());
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // 안드 WebView UA엔 '; wv' 마커가 있어 일부 사이트(리뷰노트 등)가 "웹뷰 감지→앱 업데이트 넛지"를 띄움.
        // 'wv' 마커를 빼 일반 Chrome처럼 보이게 → 그 넛지 제거(iOS는 UA에 wv 없어 무관).
        try {
            String ua = s.getUserAgentString();
            if (ua != null && ua.contains("wv")) s.setUserAgentString(ua.replace("; wv", "").replace(" wv", ""));
        } catch (Exception ignored) {}
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if (scheme == null) return false;
                scheme = scheme.toLowerCase();
                if (scheme.equals("http") || scheme.equals("https")) return false; // 웹뷰에서 로드
                // 전화·메일·문자·지도·스토어는 시스템에 넘김
                if (scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("sms") || scheme.equals("geo") || scheme.equals("market")) {
                    try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                    return true;
                }
                // 소셜 간편로그인 앱 스킴(카카오/네이버/라인 등)은 시스템으로 열어 로그인 왕복 허용.
                //  디너의여왕·리뷰노트 등이 네이버/카카오 간편로그인을 쓰는데, 앱 설치 기기에선 이 스킴이
                //  차단돼 '네이버 로그인 → 회원가입'으로 빠지던 문제(2026-11-13). revu:// 등은 계속 차단.
                if (scheme.startsWith("kakao") || scheme.equals("naversearchapp") || scheme.equals("naversearchthirdlogin")
                        || scheme.equals("nidlogin") || scheme.equals("line") || scheme.equals("fbauth2") || scheme.equals("fb")
                        || scheme.equals("storylink") || scheme.equals("payco")) {
                    try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                    return true;
                }
                // revu://, intent:// 등 커스텀 앱 스킴 → 조용히 차단(앱 열기/에러 없이 웹페이지 유지)
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                try { title.setText(Uri.parse(url).getHost()); } catch (Exception ignored) {}
                syncBottomColor(view, dialog);  // 하단(네비바) 색을 페이지 하단 버튼색에 맞춤(iOS와 동일 UX)
            }
        });

        refresh.setOnClickListener(v -> webView.reload());
        close.setOnClickListener(v -> { try { webView.destroy(); } catch (Exception ignored) {} dialog.dismiss(); });

        bar.addView(close);
        bar.addView(title);
        bar.addView(refresh);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        // 뒤로가기: 웹 히스토리 있으면 뒤로, 없으면 닫기
        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                if (webView.canGoBack()) { webView.goBack(); } else { dialog.dismiss(); }
                return true;
            }
            return false;
        });
        dialog.setOnDismissListener(d -> { try { CookieManager.getInstance().flush(); } catch (Exception ignored) {} });
        dialog.setContentView(root);
        if (dialog.getWindow() != null) dialog.getWindow().setWindowAnimations(R.style.CustomBrowserSlide); // 아래→위 슬라이드(iOS 모달 느낌)
        dialog.show();
        webView.loadUrl(url);
    }

    // 페이지 하단(고정 버튼 등) 배경색을 감지해 하단 네비게이션 바 색을 맞춘다(iOS와 동일 UX)
    private void syncBottomColor(final WebView view, final Dialog dialog) {
        final String js = "(function(){try{var el=document.elementFromPoint(Math.round(window.innerWidth/2), window.innerHeight-2);var i=0;while(el&&i<6){var bg=getComputedStyle(el).backgroundColor;if(bg&&bg.indexOf('rgba(0, 0, 0, 0)')<0&&bg!=='transparent'){return bg;}el=el.parentElement;i++;}}catch(e){}return '';})()";
        view.evaluateJavascript(js, value -> {
            Integer c = parseCssColor(value);
            if (dialog.getWindow() != null) {
                dialog.getWindow().setNavigationBarColor(c != null ? c : Color.WHITE);
            }
        });
    }

    // "rgb(r, g, b)" / "rgba(r, g, b, a)"(evaluateJavascript는 JSON 따옴표로 감쌈) → ARGB int
    private Integer parseCssColor(String raw) {
        if (raw == null) return null;
        raw = raw.replace("\"", "").trim();
        int o = raw.indexOf('('), cl = raw.indexOf(')');
        if (o < 0 || cl < 0 || cl <= o) return null;
        String[] p = raw.substring(o + 1, cl).split(",");
        if (p.length < 3) return null;
        try {
            if (p.length >= 4 && Float.parseFloat(p[3].trim()) < 0.05f) return null; // 투명이면 기본색
            int r = (int) Float.parseFloat(p[0].trim());
            int g = (int) Float.parseFloat(p[1].trim());
            int b = (int) Float.parseFloat(p[2].trim());
            return Color.rgb(r, g, b);
        } catch (Exception e) { return null; }
    }
}
