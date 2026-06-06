import Foundation

public struct DeviceInfo: Sendable, Equatable, Codable {
    public let deviceId: String
    public var name: String
    public let type: String
    public let platform: String
    public var icon: String?

    public init(
        deviceId: String,
        name: String,
        type: String = "mobile",
        platform: String = "ios",
        icon: String? = nil
    ) {
        self.deviceId = deviceId
        self.name = name
        self.type = type
        self.platform = platform
        self.icon = icon
    }
}

public struct RemoteDevice: Sendable, Equatable, Identifiable, Codable {
    public var id: String { deviceId }
    public let deviceId: String
    public let name: String
    public let type: String
    public let platform: String
    public let icon: String?

    enum CodingKeys: String, CodingKey {
        case deviceId, name, type, platform, icon
    }

    public init(
        deviceId: String,
        name: String,
        type: String,
        platform: String,
        icon: String? = nil
    ) {
        self.deviceId = deviceId
        self.name = name
        self.type = type
        self.platform = platform
        self.icon = icon
    }

    public init?(payload: [String: Any]) {
        guard let deviceId = payload["deviceId"] as? String else { return nil }
        self.deviceId = deviceId
        self.name = payload["name"] as? String ?? "不明なデバイス"
        self.type = payload["type"] as? String ?? "unknown"
        self.platform = payload["platform"] as? String ?? ""
        if let icon = payload["icon"] as? String, !icon.isEmpty {
            self.icon = icon
        } else {
            self.icon = nil
        }
    }
}
