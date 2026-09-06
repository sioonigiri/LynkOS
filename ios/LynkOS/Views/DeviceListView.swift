import LynkOSCore
import SwiftUI

struct DeviceListView: View {
    @ObservedObject private var loc = LocalizationManager.shared
    let devices: [RemoteDevice]
    let isOffline: Bool
    let isSearching: Bool
    let isRefreshing: Bool
    let disabled: Bool
    let flashDeviceId: String?
    let onSelect: (RemoteDevice) -> Void

    private let columns = [
        GridItem(.adaptive(minimum: 96, maximum: 110), spacing: 16),
    ]

    var body: some View {
        Group {
            if isOffline {
                emptyState(icon: "⚠️", title: L(.deviceOffline), animateRadar: false)
            } else if devices.isEmpty {
                let title = isRefreshing ? L(.deviceUpdating) : L(.deviceSearching)
                emptyState(icon: "📡", title: title, animateRadar: isSearching || isRefreshing)
            } else {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(Array(devices.enumerated()), id: \.element.id) { index, device in
                        DeviceBubbleButton(
                            device: device,
                            disabled: disabled,
                            flash: flashDeviceId == device.deviceId,
                            animationDelay: Double(index) * 0.06
                        ) {
                            onSelect(device)
                        }
                    }
                }
                .opacity(disabled ? 0.55 : 1)
                .allowsHitTesting(!disabled)
            }
        }
    }

    private func emptyState(icon: String, title: String, animateRadar: Bool) -> some View {
        VStack(spacing: 14) {
            ZStack {
                if animateRadar {
                    ForEach(0 ..< 3, id: \.self) { i in
                        Circle()
                            .stroke(LynkOSTheme.accent.opacity(0.5), lineWidth: 1.5)
                            .frame(width: 96, height: 96)
                            .scaleEffect(0.35)
                            .modifier(RadarPulse(delay: Double(i) * 0.8))
                    }
                }
                Circle()
                    .fill(LynkOSTheme.surface2)
                    .frame(width: 60, height: 60)
                    .overlay(Circle().stroke(LynkOSTheme.border, lineWidth: 2))
                Text(icon)
                    .font(.system(size: 26))
            }
            .frame(width: 96, height: 96)

            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LynkOSTheme.textSub)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(LynkOSTheme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(LynkOSTheme.border, style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
                )
        )
    }
}

private struct DeviceBubbleButton: View {
    let device: RemoteDevice
    let disabled: Bool
    let flash: Bool
    let animationDelay: Double
    let action: () -> Void

    @State private var appeared = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                DeviceIconBubble(
                    visual: DeviceVisual.forRemoteDevice(device),
                    flash: flash
                )
                Text(device.name)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LynkOSTheme.text)
                    .lineLimit(1)
                    .frame(maxWidth: 92)
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(appeared ? 1 : 0)
        .scaleEffect(appeared ? 1 : 0.85)
        .offset(y: appeared ? 0 : 6)
        .onAppear {
            withAnimation(.easeOut(duration: 0.3).delay(animationDelay)) {
                appeared = true
            }
        }
    }
}

private struct RadarPulse: ViewModifier {
    let delay: Double
    @State private var animate = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(animate ? 1.5 : 0.35)
            .opacity(animate ? 0 : 0.8)
            .onAppear {
                withAnimation(.easeOut(duration: 2.4).repeatForever(autoreverses: false).delay(delay)) {
                    animate = true
                }
            }
    }
}
