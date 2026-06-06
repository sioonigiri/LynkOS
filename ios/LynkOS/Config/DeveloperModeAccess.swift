import Foundation

/// デベロッパーモードは DEBUG ビルドでのみ利用可能（Release / App Store では完全非表示）。
enum DeveloperModeAccess {
    /// デベロッパーモードの UI・機能を出してよいか。
    static var isAvailable: Bool {
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    /// UserDefaults 等に保存された値を、現在のビルド構成に合わせて正規化する。
    static func normalizedDeveloperModeEnabled(_ stored: Bool) -> Bool {
        #if DEBUG
        return stored
        #else
        return false
        #endif
    }
}
