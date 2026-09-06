import LynkOSCore
import SwiftUI

/// デベロッパーモード時の補助表示(接続デバッグ・Signaling テストは非表示)。
struct DeveloperPanelView: View {
    @ObservedObject private var loc = LocalizationManager.shared
    @EnvironmentObject private var viewModel: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if viewModel.inboxEvents.isEmpty {
                Text(L(.debugInboxEventsPlaceholder))
                    .font(.caption)
                    .foregroundStyle(LynkOSTheme.textMuted)
            } else {
                ForEach(Array(viewModel.inboxEvents.enumerated()), id: \.offset) { _, event in
                    Text(event)
                        .font(.caption.monospaced())
                        .foregroundStyle(LynkOSTheme.textSub)
                }
            }
        }
        .padding()
        .background(LynkOSTheme.surface2.opacity(0.6), in: RoundedRectangle(cornerRadius: 16))
    }
}
