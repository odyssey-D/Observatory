import SwiftUI
import WebKit

/// The iOS shell.  A SwiftUI view hosting a WKWebView that loads the bundled
/// Observatory web app from `Bundle.main/WebBundle/index.html`.  This preserves
/// byte-identical visual behaviour with the web client — the renderer is the
/// single source of truth (spec §4.1).
struct ContentView: View {
    var body: some View {
        ObservatoryWebView()
            .ignoresSafeArea()
            .background(Color.black)
    }
}

struct ObservatoryWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Enable WebGL / WebGPU — both default-on in modern WKWebView, but be explicit.
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.preferences.isFraudulentWebsiteWarningEnabled = false
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
            config.defaultWebpagePreferences.preferredContentMode = .mobile
        }
        // Pass-through for canvas pointer / touch
        let userContent = WKUserContentController()
        userContent.add(context.coordinator, name: "observatoryNative")
        config.userContentController = userContent

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        if #available(iOS 16.4, *) {
            webView.isInspectable = true  // Web Inspector for dev — harmless in release.
        }
        // Prevent system text-selection callouts on long-press
        webView.allowsLinkPreview = false

        // Load the bundled index.html from WebBundle/.
        loadWebBundle(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) { /* state-driven nav not needed */ }

    private func loadWebBundle(into webView: WKWebView) {
        // Prefer the bundled folder if present.
        if let bundledIndex = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebBundle") {
            let folder = bundledIndex.deletingLastPathComponent()
            webView.loadFileURL(bundledIndex, allowingReadAccessTo: folder)
            return
        }
        // Fallback (development without bundled web) — points to a local dev server.
        // Useful when running on simulator with Vite running on the host.
        let host = "http://localhost:5173"
        if let url = URL(string: host) {
            webView.load(URLRequest(url: url))
            return
        }
        // Last-resort: blank with a hint.
        let html = """
        <!doctype html>
        <html><head><meta name=viewport content='width=device-width,initial-scale=1'></head>
        <body style='background:#08090C;color:#A1A1AA;font-family:-apple-system;text-align:center;padding-top:32vh'>
        <p>Web bundle missing.</p>
        <p>Run <code>xcodegen generate</code> then build to bundle <code>web/dist</code>.</p>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Reserved channel for future native bridging — e.g. system screensaver hooks.
        _ = message.body
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // Non-fatal — fall through.  WebGL availability or local file 404s log here.
        NSLog("Observatory navigation failed: \\(error.localizedDescription)")
    }
}
