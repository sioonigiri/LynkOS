import Combine
import Foundation

/// アプリ内 JP/EN 切り替えの単一の情報源。
///
/// - メインアプリ単体の起動時は `UserDefaults.standard` の保存値、なければ端末ロケールを使う。
/// - Share Extension とも表示言語を揃えるため、変更時は App Group 経由でも共有する
///   （`UserDefaults(suiteName:)` は使わず、既存の `AppGroupSettings` の JSON 共有と同じ方式）。
@MainActor
public final class LocalizationManager: ObservableObject {
    public static let shared = LocalizationManager()

    @Published public private(set) var language: AppLanguage

    private static let userDefaultsKey = "lynkos.language"

    private init() {
        language = Self.loadInitialLanguage()
    }

    public func setLanguage(_ language: AppLanguage) {
        guard self.language != language else { return }
        self.language = language
        UserDefaults.standard.set(language.rawValue, forKey: Self.userDefaultsKey)
        AppGroupSettings.syncLanguage(language.rawValue)
    }

    public func string(_ key: LocalizationKey, arguments: [CVarArg] = []) -> String {
        let table = language == .ja ? LocalizationStrings.ja : LocalizationStrings.en
        let format = table[key] ?? key.rawValue
        guard !arguments.isEmpty else { return format }
        return String(format: format, arguments: arguments)
    }

    private static func loadInitialLanguage() -> AppLanguage {
        if let saved = UserDefaults.standard.string(forKey: userDefaultsKey),
           let language = AppLanguage(rawValue: saved) {
            return language
        }
        if let shared = AppGroupSettings.loadLanguage(),
           let language = AppLanguage(rawValue: shared) {
            return language
        }
        return AppLanguage.systemDefault()
    }
}

/// `LocalizationManager.shared` を介して文言を取得するショートハンド。
/// SwiftUI の View 内で言語切り替えに追従させたい場合は、その View に
/// `@ObservedObject private var loc = LocalizationManager.shared` を持たせること
/// （`body` が `loc.language` を間接的に参照することで再描画のトリガーになる）。
@MainActor
public func L(_ key: LocalizationKey, _ arguments: CVarArg...) -> String {
    LocalizationManager.shared.string(key, arguments: arguments)
}
