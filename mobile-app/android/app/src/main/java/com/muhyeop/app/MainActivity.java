package com.muhyeop.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private View statusBarBg;
    private WindowInsetsControllerCompat insetsController;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final ViewGroup decor = (ViewGroup) getWindow().getDecorView();

        // 상단 상태바(시계) 영역에만 배경 뷰를 얹는다. (하단 내비게이션은 흰색 windowBackground 유지)
        statusBarBg = new View(this);
        statusBarBg.setBackgroundColor(Color.BLACK);
        statusBarBg.setClickable(false);
        statusBarBg.setFocusable(false);
        decor.addView(statusBarBg, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 0));

        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            int topInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            ViewGroup.LayoutParams lp = statusBarBg.getLayoutParams();
            if (lp.height != topInset) {
                lp.height = topInset;
                statusBarBg.setLayoutParams(lp);
            }
            return insets;
        });

        insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        applyStatusBar(false); // 기본(지도): 상단 검정 + 흰 아이콘
        // Capacitor SystemBars가 onCreate 이후 main thread에 setStyle을 post하므로 그 뒤에 한번 더 덮어씀
        decor.post(() -> applyStatusBar(false));

        // 웹에서 전체화면 흰 모달 열림/닫힘 시 상단 바 색을 전환할 수 있게 인터페이스 노출
        getBridge().getWebView().addJavascriptInterface(this, "MuhyeopNativeUI");
    }

    // white=true: 상단 흰색 + 어두운 아이콘(흰 배경 모달 화면). false: 상단 검정 + 흰 아이콘(지도)
    private void applyStatusBar(boolean white) {
        if (statusBarBg != null) {
            statusBarBg.setBackgroundColor(white ? Color.WHITE : Color.BLACK);
        }
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(white);   // 흰 배경 → 어두운 아이콘
            insetsController.setAppearanceLightNavigationBars(true); // 하단은 항상 흰색 → 어두운 제스처바
        }
    }

    @JavascriptInterface
    public void setStatusBar(final boolean white) {
        runOnUiThread(() -> applyStatusBar(white));
    }
}
