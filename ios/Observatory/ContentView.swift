import SwiftUI
import WebKit

/// SwiftUI shell hosting a WKWebView that loads the bundled Observatory web app.
struct ContentView: View {
    @Binding var pendingPairURL: URL?

    var body: some View {
        ObservatoryWebView(pendingPairURL: $pendingPairURL)
            .ignoresSafeArea()
            .background(Color.black)
    }
}

struct ObservatoryWebView: UIViewRepresentable {
    @Binding var pendingPairURL: URL?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.preferences.isFraudulentWebsiteWarningEnabled = false
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
            config.defaultWebpagePreferences.preferredContentMode = .mobile
        }
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
            webView.isInspectable = true
        }
        webView.allowsLinkPreview = false

        context.coordinator.webView = webView
        loadWebBundle(into: webView, pairURL: pendingPairURL)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // If a pair URL just arrived, deliver it to the web app.
        if let url = pendingPairURL {
            context.coordinator.deliver(pairURL: url)
            // Clear after delivery so we don't re-fire on every re-render.
            DispatchQueue.main.async { self.pendingPairURL = nil }
        }
    }

    private func loadWebBundle(into webView: WKWebView, pairURL: URL?) {
        if let bundledIndex = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebBundle") {
            let folder = bundledIndex.deletingLastPathComponent()
            let finalURL = buildLaunchURL(from: bundledIndex, pairURL: pairURL)
            webView.loadFileURL(finalURL, allowingReadAccessTo: folder)
            return
        }
        let host = "http://localhost:5173"
        if let url = URL(string: host) {
            webView.load(URLRequest(url: url))
            return
        }
        let html = """
        <!doctype html>
        <html><head><meta name=viewport content='width=device-width,initial-scale=1'></head>
        <body style='background:#0A0B14;color:#A6A4B5;font-family:-apple-system;text-align:center;padding-top:32vh'>
        <p>Web bundle missing.</p>
        <p>Run <code>xcodegen generate</code> then build to bundle <code>web/dist</code>.</p>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    /// Append `?pair=<encoded>` so the web app's existing handler auto-connects.
    private func buildLaunchURL(from bundleIndex: URL, pairURL: URL?) -> URL {
        guard let pair = pairURL,
              var comps = URLComponents(url: bundleIndex, resolvingAgainstBaseURL: false) else {
            return bundleIndex
        }
        var items = comps.queryItems ?? []
        items.append(URLQueryItem(name: "pair", value: pair.absoluteString))
        comps.queryItems = items
        return comps.url ?? bundleIndex
    }
}

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func deliver(pairURL: URL) {
        // Send a JS event into the page so it can pick the URL up post-mount.
        guard let webView = webView else { return }
        let escaped = pairURL.absoluteString
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let js = "window.__observatoryPair && window.__observatoryPair('\(escaped)');"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Reserved for future native bridging.
        _ = message.body
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("Observatory navigation failed: \(error.localizedDescription)")
    }
}
