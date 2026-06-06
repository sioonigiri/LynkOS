import Foundation

/// Django サーバー URL（HTTP）と WebSocket ベース URL を管理する。
public struct ServerConfig: Sendable, Equatable {
    public static let userDefaultsKey = "lynkos.serverOrigin"
    public static let defaultHTTPOrigin = "http://127.0.0.1:8000"
    /// Info.plist `LynkosDefaultServerOrigin` — 将来の本番シグナリング URL 用（任意）。
    public static let bundledDefaultOriginInfoKey = "LynkosDefaultServerOrigin"

    public let httpOrigin: String

    public init(httpOrigin: String, treatEmptyAsUnconfigured: Bool = false) {
        let trimmed = httpOrigin.trimmingCharacters(in: .whitespacesAndNewlines)
        if treatEmptyAsUnconfigured, trimmed.isEmpty {
            self.httpOrigin = ""
        } else {
            self.httpOrigin = Self.normalizeHTTPOrigin(httpOrigin)
        }
    }

    /// アプリ同梱の既定シグナリング URL（本番ビルドで設定可能）。
    public static var bundledDefaultOrigin: String? {
        guard let raw = Bundle.main.object(
            forInfoDictionaryKey: bundledDefaultOriginInfoKey
        ) as? String else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let normalized = normalizeHTTPOrigin(trimmed)
        let config = ServerConfig(httpOrigin: normalized, treatEmptyAsUnconfigured: true)
        guard config.isConfigured, !config.isLoopback else { return nil }
        return config.httpOrigin
    }

    public var wsOrigin: String {
        Self.toWebSocketOrigin(httpOrigin)
    }

    /// 127.0.0.1 / localhost — 実機では Mac に届かない。
    public var isLoopback: Bool {
        guard let host = URLComponents(string: httpOrigin)?.host?.lowercased() else {
            return false
        }
        return host == "127.0.0.1" || host == "localhost" || host == "::1"
    }

    public var isConfigured: Bool {
        !httpOrigin.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public var apiDevicesURL: URL? {
        URL(string: "\(httpOrigin)/api/devices/")
    }

    public func presenceWebSocketURL() -> URL? {
        URL(string: "\(wsOrigin)/ws/presence/")
    }

    public func inboxWebSocketURL(deviceId: String) -> URL? {
        let encoded = deviceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? deviceId
        return URL(string: "\(wsOrigin)/ws/inbox/\(encoded)/")
    }

    public func signalingWebSocketURL(roomName: String) -> URL? {
        let encoded = roomName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomName
        return URL(string: "\(wsOrigin)/ws/signal/\(encoded)/")
    }

    public static func loadFromUserDefaults(
        defaults: UserDefaults = .standard
    ) -> ServerConfig {
        let stored = defaults.string(forKey: userDefaultsKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let stored, !stored.isEmpty {
            return ServerConfig(httpOrigin: stored)
        }
        return ServerConfig(httpOrigin: defaultHTTPOrigin)
    }

    public func saveToUserDefaults(defaults: UserDefaults = .standard) {
        defaults.set(httpOrigin, forKey: Self.userDefaultsKey)
    }

    public static func normalizeHTTPOrigin(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while value.hasSuffix("/") {
            value.removeLast()
        }
        if value.isEmpty {
            return defaultHTTPOrigin
        }

        let lower = value.lowercased()
        if lower.hasPrefix("ws://") {
            value = "http://" + String(value.dropFirst(5))
        } else if lower.hasPrefix("wss://") {
            value = "https://" + String(value.dropFirst(6))
        } else if !lower.hasPrefix("http://") && !lower.hasPrefix("https://") {
            value = "http://\(value)"
        }
        return value
    }

    public static func toWebSocketOrigin(_ httpOrigin: String) -> String {
        guard var components = URLComponents(string: httpOrigin) else {
            return "ws://127.0.0.1:8000"
        }
        switch components.scheme?.lowercased() {
        case "https":
            components.scheme = "wss"
        default:
            components.scheme = "ws"
        }
        guard let url = components.url else {
            return "ws://127.0.0.1:8000"
        }
        var origin = url.absoluteString
        while origin.hasSuffix("/") {
            origin.removeLast()
        }
        return origin
    }
}
