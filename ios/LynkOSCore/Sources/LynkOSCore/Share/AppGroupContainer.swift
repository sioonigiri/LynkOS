import Foundation

public enum ShareInboxError: Error, LocalizedError {
    case appGroupUnavailable

    public var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            "App Group が利用できません"
        }
    }
}

/// メインアプリ ↔ Share Extension 共有の App Group コンテナ。
public enum AppGroupContainer {
    public static let appGroupID = "group.com.lynkos.app"

    public static func containerURL() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }
}
