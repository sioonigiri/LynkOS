import SwiftUI

struct ReceiveRequestDialog: View {
    let request: TransferRequest
    let queuedBehind: Int
    let onAccept: () -> Void
    let onReject: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture { onReject() }

            VStack(spacing: 16) {
                DeviceIconBubble(
                    visual: DeviceVisual.forLocalDevice(
                        name: request.senderName,
                        platform: request.senderType == "mobile" ? "iphone" : "windows",
                        iconData: request.senderIcon
                    ),
                    diameter: 72
                )

                Text(request.senderName)
                    .font(.headline)
                    .foregroundStyle(LynkOSTheme.text)

                if queuedBehind > 0 {
                    Text("+\(queuedBehind) 件待ち")
                        .font(.caption)
                        .foregroundStyle(LynkOSTheme.textMuted)
                }

                VStack(spacing: 8) {
                    ForEach(request.files) { file in
                        HStack(spacing: 10) {
                            Text(fileIcon(for: file))
                                .font(.title3)
                            Text(file.name)
                                .font(.subheadline)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(LynkOSTheme.surface2, in: RoundedRectangle(cornerRadius: 10))
                    }
                }
                .frame(maxWidth: .infinity)

                HStack(spacing: 12) {
                    receiveActionRow(
                        title: "拒否",
                        systemImage: "xmark",
                        highlighted: false,
                        foreground: LynkOSTheme.textSub,
                        border: LynkOSTheme.border,
                        background: LynkOSTheme.surface2,
                        action: onReject
                    )
                    receiveActionRow(
                        title: "許可",
                        systemImage: "circle",
                        highlighted: true,
                        foreground: LynkOSTheme.accent,
                        border: LynkOSTheme.accent,
                        background: LynkOSTheme.accentSoft,
                        action: onAccept
                    )
                }
                .padding(.top, 4)
            }
            .padding(24)
            .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            .padding(.horizontal, 28)
        }
    }

    private func receiveActionRow(
        title: String,
        systemImage: String,
        highlighted: Bool,
        foreground: Color,
        border: Color,
        background: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                Text(title)
                    .font(.subheadline.weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(foreground)
            .background(background, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(border, lineWidth: highlighted ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }

    private func fileIcon(for file: TransferFileMeta) -> String {
        if file.mimeType.hasPrefix("image/") { return "🖼" }
        if file.mimeType.hasPrefix("video/") { return "🎬" }
        if file.mimeType.contains("pdf") { return "📄" }
        return "📄"
    }
}
