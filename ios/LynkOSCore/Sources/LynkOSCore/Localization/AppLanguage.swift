import Foundation

/// LynkOS がサポートする表示言語。将来的に韓国語・中国語などを追加する場合はここに case を足すだけでよい。
public enum AppLanguage: String, CaseIterable, Sendable, Codable {
    case ja
    case en

    /// 端末のロケールから初回表示言語を決める（日本語端末 → 日本語、それ以外 → 英語）。
    public static func systemDefault() -> AppLanguage {
        let code = Locale.preferredLanguages.first ?? Locale.current.identifier
        return code.lowercased().hasPrefix("ja") ? .ja : .en
    }
}
