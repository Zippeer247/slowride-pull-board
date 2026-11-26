package com.slowride.pullboard

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Full-screen, always-on board. All it does:
 *  - show BuildConfig.BOARD_URL in a WebView and keep the screen awake
 *  - pass the remote to the page (OK -> Enter, Back -> window.pullboardBack())
 *  - recover on its own from network drops, page errors and WebView crashes
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val handler = Handler(Looper.getMainLooper())
    private var retryDelayMs = INITIAL_RETRY_MS
    private var showingOffline = false

    private val retry = Runnable { loadBoard() }
    private val dailyRefresh = object : Runnable {
        override fun run() {
            // Fresh page every few hours keeps a 24/7 WebView from slowly leaking memory.
            loadBoard()
            handler.postDelayed(this, REFRESH_EVERY_MS)
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            handler.post { if (showingOffline) loadBoard() }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
        )

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false // optional new-order chime
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            webViewClient = BoardClient()
        }
        setContentView(web)
        hideSystemUi()
        web.requestFocus()

        getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(networkCallback)
        loadBoard()
        handler.postDelayed(dailyRefresh, REFRESH_EVERY_MS)
    }

    private fun loadBoard() {
        handler.removeCallbacks(retry)
        showingOffline = false
        web.loadUrl(BuildConfig.BOARD_URL)
    }

    private fun showOfflineAndRetry(reason: String) {
        if (showingOffline) return
        showingOffline = true
        val secs = retryDelayMs / 1000
        val html = """
            <html><body style="margin:0;background:#0d0e10;color:#f4f1ea;font-family:sans-serif;
              display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
              <div><div style="font-size:64px;font-weight:900;color:#ff4d3d">NOT CONNECTED</div>
              <div style="font-size:32px;margin-top:20px">Orders may be missing. Retrying in $secs s…</div>
              <div style="font-size:20px;margin-top:28px;color:#9a9ca3">${reason.replace("<", "")}</div></div>
            </body></html>
        """.trimIndent()
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        handler.postDelayed(retry, retryDelayMs)
        retryDelayMs = (retryDelayMs * 2).coerceAtMost(MAX_RETRY_MS)
    }

    private inner class BoardClient : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String?) {
            if (!showingOffline) retryDelayMs = INITIAL_RETRY_MS
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showOfflineAndRetry(error.description?.toString() ?: "network error")
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // WebView crashed: rebuild the whole activity rather than leave a blank screen.
            handler.post { recreate() }
            return true
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                // Never leave the board with Back. (Home still works.)
                if (event.action == KeyEvent.ACTION_UP) {
                    web.evaluateJavascript("window.pullboardBack && window.pullboardBack()", null)
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER -> {
                // Make OK look like Enter to the page, on every WebView version. Keep the
                // original timing and repeat count: the page tells a tap (pull) from a
                // hold (bring back the last pulled order) by keydown -> keyup and e.repeat.
                web.dispatchKeyEvent(
                    KeyEvent(
                        event.downTime, event.eventTime, event.action,
                        KeyEvent.KEYCODE_ENTER, event.repeatCount, event.metaState,
                    ),
                )
                return true
            }
            KeyEvent.KEYCODE_MENU -> {
                if (event.action == KeyEvent.ACTION_UP) loadBoard() // ☰ = reload
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        // Coming back from Home or the screensaver: get fresh data right away.
        if (showingOffline) loadBoard() else web.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        runCatching { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(networkCallback) }
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val INITIAL_RETRY_MS = 5_000L
        private const val MAX_RETRY_MS = 60_000L
        private const val REFRESH_EVERY_MS = 6 * 60 * 60 * 1000L
    }
}
