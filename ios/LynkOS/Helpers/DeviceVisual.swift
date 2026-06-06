import LynkOSCore
import SwiftUI
import UIKit

private final class DeviceIconCache {
    static let shared = DeviceIconCache()
    private var cache: [String: UIImage] = [:]

    func image(for dataURL: String) -> UIImage? {
        if let cached = cache[dataURL] { return cached }
        guard let image = decodeDataURL(dataURL) else { return nil }
        let scaled = ImagePreviewHelper.downscaledPreview(from: image, maxPixelSize: 144) ?? image
        cache[dataURL] = scaled
        return scaled
    }

    private func decodeDataURL(_ value: String) -> UIImage? {
        guard let comma = value.firstIndex(of: ",") else { return nil }
        let base64 = String(value[value.index(after: comma)...])
        guard let data = Data(base64Encoded: base64) else { return nil }
        return UIImage(data: data)
    }
}

enum DeviceVisual {
    case emoji(String)
    case photo(UIImage)

    static func forRemoteDevice(_ device: RemoteDevice) -> DeviceVisual {
        if let icon = device.icon?.trimmingCharacters(in: .whitespacesAndNewlines),
           icon.lowercased().hasPrefix("data:image"),
           let image = DeviceIconCache.shared.image(for: icon) {
            return .photo(image)
        }
        return .emoji(emojiFor(platform: device.platform, type: device.type))
    }

    static func forLocalDevice(name: String, platform: String, iconData: String?) -> DeviceVisual {
        if let iconData,
           iconData.lowercased().hasPrefix("data:image"),
           let image = DeviceIconCache.shared.image(for: iconData) {
            return .photo(image)
        }
        return .emoji(emojiFor(platform: platform, type: "mobile"))
    }

    private static func emojiFor(platform: String, type: String) -> String {
        let p = platform.lowercased()
        let t = type.lowercased()
        if p == "iphone" || p == "ipad" || p == "android" || t == "mobile" {
            return "📱"
        }
        if p == "mac" || p == "windows" || t == "desktop" {
            return "🖥"
        }
        return "📱"
    }
}

struct DeviceIconBubble: View {
    let visual: DeviceVisual
    var diameter: CGFloat = 72
    var flash: Bool = false

    private var isPhoto: Bool {
        if case .photo = visual { return true }
        return false
    }

    var body: some View {
        ZStack {
            if !isPhoto {
                Circle()
                    .fill(LynkOSTheme.surface2)
                Circle()
                    .stroke(LynkOSTheme.border, lineWidth: 2)
            }
            content
        }
        .frame(width: diameter, height: diameter)
        .clipShape(Circle())
        .scaleEffect(flash ? 0.97 : 1)
        .animation(.easeOut(duration: 0.24), value: flash)
    }

    @ViewBuilder
    private var content: some View {
        switch visual {
        case .emoji(let text):
            Text(text)
                .font(.system(size: diameter * 0.47))
        case .photo(let image):
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: diameter, height: diameter)
        }
    }
}
