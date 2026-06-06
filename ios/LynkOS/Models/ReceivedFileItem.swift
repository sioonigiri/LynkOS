import Foundation

/// 受信直後・保存ダイアログ表示中のみ保持（一時ファイル URL 付き）。
struct PendingReceivedFile: Identifiable, Equatable {
    let id: UUID
    let name: String
    let size: Int64
    let mimeType: String
    let tempURL: URL

    init(
        id: UUID = UUID(),
        name: String,
        size: Int64,
        mimeType: String,
        tempURL: URL
    ) {
        self.id = id
        self.name = name
        self.size = size
        self.mimeType = mimeType
        self.tempURL = tempURL
    }

    var isMedia: Bool {
        mimeType.hasPrefix("image/") || mimeType.hasPrefix("video/")
    }

    var iconEmoji: String {
        if mimeType.hasPrefix("video/") { return "🎬" }
        if mimeType.hasPrefix("image/") { return "🖼" }
        if mimeType.contains("pdf") { return "📄" }
        if mimeType.contains("zip") { return "🗜" }
        return "📄"
    }

    static func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

/// 受信履歴（メタデータのみ。ファイル本体は保持しない）。
struct ReceivedFileRecord: Identifiable, Equatable {
    enum SaveDestination: Equatable {
        case photos
        case files
    }

    let id: UUID
    let name: String
    let size: Int64
    let mimeType: String
    let savedAt: Date
    let destination: SaveDestination

    var iconEmoji: String {
        if mimeType.hasPrefix("video/") { return "🎬" }
        if mimeType.hasPrefix("image/") { return "🖼" }
        if mimeType.contains("pdf") { return "📄" }
        if mimeType.contains("zip") { return "🗜" }
        return "📄"
    }

    var statusLabel: String {
        switch destination {
        case .photos:
            "写真に保存済み"
        case .files:
            "ファイルに保存済み"
        }
    }
}
