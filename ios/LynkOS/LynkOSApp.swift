import SwiftUI

@main
struct LynkOSApp: App {
    @StateObject private var viewModel = AppViewModel()
    @State private var didBootstrap = false

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .tint(LynkOSTheme.accent)
                .task {
                    guard !didBootstrap else { return }
                    didBootstrap = true
                    await viewModel.bootstrap()
                }
        }
    }
}
