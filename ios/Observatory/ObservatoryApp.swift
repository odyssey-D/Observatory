import SwiftUI

@main
struct ObservatoryApp: App {
    /// Most recent inbound observatory:// URL, forwarded to the WebView when set.
    @State private var pendingPairURL: URL? = nil

    var body: some Scene {
        WindowGroup {
            ContentView(pendingPairURL: $pendingPairURL)
                .preferredColorScheme(.dark)
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .onOpenURL { url in
                    // `observatory://connect?ws=...&token=...` — captured here and
                    // handed to the web layer via `?pair=...` query string on the
                    // bundle URL.  The web app already understands that param.
                    pendingPairURL = url
                }
        }
    }
}
