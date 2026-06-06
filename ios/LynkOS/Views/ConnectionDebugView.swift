import LynkOSCore
import SwiftUI

struct ConnectionDebugView: View {
    let status: ConnectionStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("接続状態")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LynkOSTheme.text)
            statusRow(title: "Presence", subtitle: "/ws/presence/", state: status.presence)
            statusRow(title: "Inbox", subtitle: "/ws/inbox/{deviceId}/", state: status.inbox)
            statusRow(title: "Signaling", subtitle: "転送時 / テスト接続", state: status.signaling)
            if let error = status.lastError {
                Text("直近のエラー: \(error)")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(LynkOSTheme.border, lineWidth: 1))
    }

    private func statusRow(title: String, subtitle: String, state: ConnectionState) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(LynkOSTheme.text)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(LynkOSTheme.textMuted)
            }
            Spacer()
            Text(state.label)
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(color(for: state).opacity(0.15), in: Capsule())
                .foregroundStyle(color(for: state))
        }
    }

    private func color(for state: ConnectionState) -> Color {
        switch state {
        case .connected: .green
        case .connecting, .reconnecting: .orange
        case .disconnected: LynkOSTheme.textMuted
        }
    }
}
