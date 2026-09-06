import Foundation

/// メインアプリ ↔ Share Extension 間の設定共有（App Group コンテナ内 JSON）。
/// `UserDefaults(suiteName:)` は使わない（起動時の CFPrefs 警告を避ける）。
public enum AppGroupSettings {
    private struct SharedState: Codable {
        var deviceId: String
        var deviceName: String
        var serverOrigin: String
        var language: String?
    }

    public static var isAppGroupAvailable: Bool {
        AppGroupContainer.containerURL() != nil
    }

    public static func syncFromMainApp(deviceId: String, deviceName: String, serverConfig: ServerConfig) {
        var state = loadState() ?? SharedState(deviceId: deviceId, deviceName: deviceName, serverOrigin: serverConfig.httpOrigin, language: nil)
        state.deviceId = deviceId
        state.deviceName = deviceName
        state.serverOrigin = serverConfig.httpOrigin
        saveState(state)
    }

    public static func loadServerConfig() -> ServerConfig {
        guard let origin = loadState()?.serverOrigin, !origin.isEmpty else {
            return ServerConfig(httpOrigin: "")
        }
        return ServerConfig(httpOrigin: origin)
    }

    public static func loadDeviceId() -> String? {
        loadState()?.deviceId
    }

    public static func loadDeviceName() -> String {
        loadState()?.deviceName ?? "iPhone"
    }

    /// メインアプリで選択された表示言語を Share Extension にも共有する。
    public static func syncLanguage(_ language: String) {
        var state = loadState() ?? SharedState(deviceId: "", deviceName: "iPhone", serverOrigin: "", language: language)
        state.language = language
        saveState(state)
    }

    public static func loadLanguage() -> String? {
        loadState()?.language
    }

    // MARK: - Private

    private static func settingsFileURL() -> URL? {
        guard let base = AppGroupContainer.containerURL() else { return nil }
        let dir = base.appendingPathComponent("Settings", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            return nil
        }
        return dir.appendingPathComponent("shared-state.json")
    }

    private static func loadState() -> SharedState? {
        guard let url = settingsFileURL(),
              let data = try? Data(contentsOf: url) else {
            return nil
        }
        return try? JSONDecoder().decode(SharedState.self, from: data)
    }

    private static func saveState(_ state: SharedState) {
        guard let url = settingsFileURL(),
              let data = try? JSONEncoder().encode(state) else {
            return
        }
        try? data.write(to: url, options: .atomic)
    }
}
