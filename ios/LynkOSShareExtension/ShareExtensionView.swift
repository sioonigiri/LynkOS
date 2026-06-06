import LynkOSCore
import SwiftUI

struct ShareExtensionView: View {
    @ObservedObject var viewModel: ShareExtensionViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                attachmentHeader
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                content
            }
            .navigationTitle("LynkOS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { viewModel.cancel() }
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.screenState {
        case .loadingAttachment:
            loadingView("共有内容を読み込み中…")
        case .needsMainAppSetup:
            messageView(
                title: "セットアップが必要です",
                subtitle: "同一 Wi-Fi で PC または Mac の LynkOS を起動してください。初回は LynkOS アプリを一度開いてください。"
            )
        case .searching:
            loadingView("近くのデバイスを探しています…")
        case .attachmentError(let message):
            messageView(title: message, subtitle: nil)
        case .ready:
            deviceList
        case .waitingAccept(let peerName):
            loadingView("\(peerName) の許可を待っています…")
        case .connecting(let peerName):
            loadingView("\(peerName) に接続中…")
        case .sending(let peerName, let progress):
            sendingView(peerName: peerName, progress: progress)
        case .completed:
            completedView
        case .rejected:
            messageView(
                title: "拒否されました",
                subtitle: "相手が転送を拒否しました",
                actionTitle: "閉じる",
                action: { viewModel.dismissAfterComplete() }
            )
        case .transferError(let message):
            messageView(
                title: message,
                subtitle: nil,
                actionTitle: "閉じる",
                action: { viewModel.dismissAfterComplete() }
            )
        }
    }

    private var attachmentHeader: some View {
        HStack(spacing: 12) {
            Group {
                if let image = viewModel.attachment?.thumbnail {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Text("📄")
                        .font(.title2)
                }
            }
            .frame(width: 52, height: 52)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(viewModel.attachment?.fileName ?? "ファイル")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                if let size = viewModel.attachment?.size {
                    Text(formatBytes(size))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var deviceList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let hint = viewModel.bonjourHint {
                    Text(hint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 4)
                }

                if viewModel.devices.isEmpty {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("検索中…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("同一 Wi-Fi 上で Web / iOS の LynkOS が起動している必要があります")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 36)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 88, maximum: 100), spacing: 14)], spacing: 14) {
                        ForEach(viewModel.devices) { device in
                            ShareDeviceBubble(
                                device: device,
                                isSelected: viewModel.selectedDeviceId == device.id,
                                isEnabled: device.isTransferable
                            ) {
                                viewModel.selectDevice(device)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private func loadingView(_ message: String) -> some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func messageView(
        title: String,
        subtitle: String?,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) -> some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.center)
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 8)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var completedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.green)
            Text("送信完了")
                .font(.headline)
            if let name = viewModel.attachment?.fileName {
                Text(name)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            Button("閉じる") { viewModel.dismissAfterComplete() }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func sendingView(peerName: String, progress: Int) -> some View {
        VStack(spacing: 16) {
            ProgressView(value: Double(progress), total: 100)
                .progressViewStyle(.linear)
                .padding(.horizontal, 32)
            Text("\(peerName) に送信中…")
                .font(.subheadline)
            Text("\(progress)%")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

private struct ShareDeviceBubble: View {
    let device: ShareExtensionViewModel.DeviceRow
    let isSelected: Bool
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(Color(.secondarySystemBackground))
                    Circle()
                        .stroke(isSelected ? Color.accentColor : Color(.separator), lineWidth: isSelected ? 2.5 : 1.5)
                    Text(emoji)
                        .font(.system(size: 28))
                }
                .frame(width: 68, height: 68)

                Text(device.name)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(isEnabled ? .primary : .secondary)

                if device.source == .bonjour {
                    Text("Bonjour")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .opacity(isEnabled ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
    }

    private var emoji: String {
        let p = device.platform.lowercased()
        if p.contains("mac") || p.contains("windows") || device.type == "desktop" { return "🖥" }
        if p.contains("iphone") || p.contains("ipad") || p.contains("ios") || device.type == "mobile" { return "📱" }
        return "📡"
    }
}
