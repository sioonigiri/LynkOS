import Foundation

/// 受信ファイルの一時保存。
/// - 書き込み中: `tmp/lynkos-incoming`（受信中断時のみ掃除）
/// - 受信完了〜ユーザー保存まで: `Caches/lynkos-pending/{id}/`（bootstrap で消さない）
public enum ReceivedFileStorage {
    private static let incomingFolderName = "lynkos-incoming"
    private static let pendingFolderName = "lynkos-pending"

    public enum RetentionError: Error {
        case sourceMissing
        case copyFailed
    }

    // MARK: - 受信書き込み（WebRTC）

    public static var incomingDirectory: URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent(incomingFolderName, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// 受信完了後、ユーザーが保存先を選ぶまで保持する URL（Caches）。
    public static func makePendingReceiveURL(receiveId: String, fileName: String) -> URL {
        let folder = pendingRootDirectory()
            .appendingPathComponent(sanitizePathComponent(receiveId), isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return uniqueURL(in: folder, fileName: sanitizeFileName(fileName))
    }

    // MARK: - 存在確認

    public static func fileExists(at url: URL) -> Bool {
        let standardized = url.standardizedFileURL
        var isDirectory: ObjCBool = false
        let fm = FileManager.default
        if fm.fileExists(atPath: standardized.path, isDirectory: &isDirectory),
           !isDirectory.boolValue {
            return true
        }
        if (try? standardized.checkResourceIsReachable()) == true {
            var dir: ObjCBool = false
            return fm.fileExists(atPath: standardized.path, isDirectory: &dir) && !dir.boolValue
        }
        return false
    }

    /// ファイルアプリ保存用に tmp へコピー（Caches の URL を picker に渡す前の保険）。
    public static func makeDocumentExportStagingCopy(sourceURL: URL, fileName: String) throws -> URL {
        let fm = FileManager.default
        let source = sourceURL.standardizedFileURL
        guard fm.isReadableFile(atPath: source.path) else {
            throw RetentionError.sourceMissing
        }
        let dir = fm.temporaryDirectory
            .appendingPathComponent("lynkos-export-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let dest = dir.appendingPathComponent(sanitizeFileName(fileName))
        if fm.fileExists(atPath: dest.path) {
            try fm.removeItem(at: dest)
        }
        try fm.copyItem(at: source, to: dest)
        return dest
    }

    public static func deleteDocumentExportStagingCopy(at url: URL) {
        let fm = FileManager.default
        let path = url.standardizedFileURL.path
        let root = fm.temporaryDirectory.standardizedFileURL.path + "/lynkos-export-"
        guard path.hasPrefix(root) else { return }
        let dir = url.deletingLastPathComponent()
        try? fm.removeItem(at: dir)
    }

    public static func fileSize(at url: URL) -> Int64 {
        let values = try? url.standardizedFileURL.resourceValues(forKeys: [.fileSizeKey])
        return Int64(values?.fileSize ?? 0)
    }

    /// 受信完了直後: フラッシュして存在・サイズを確認。
    public static func prepareReceivedFileForHandoff(at url: URL) -> URL? {
        let standardized = url.standardizedFileURL
        guard fileExists(at: standardized) else { return nil }
        if let handle = try? FileHandle(forReadingFrom: standardized) {
            try? handle.close()
        }
        return standardized
    }

    // MARK: - 削除

    public static func deletePendingReceiveFile(at url: URL) {
        let fm = FileManager.default
        let standardized = url.standardizedFileURL
        guard isManagedPendingURL(standardized) else { return }

        let receiveDir = standardized.deletingLastPathComponent()
        if isManagedPendingReceiveDirectory(receiveDir) {
            try? fm.removeItem(at: receiveDir)
            return
        }
        try? fm.removeItem(at: standardized)
    }

    public static func deleteIncomingTempFile(at url: URL) {
        guard isManagedIncomingURL(url) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - 起動時掃除（pending は触らない）

    public static func purgeIncomingTempFiles() {
        let fm = FileManager.default
        let dir = incomingDirectory
        guard let entries = try? fm.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return }
        for url in entries {
            try? fm.removeItem(at: url)
        }
    }

    public static func purgeOrphanPendingReceiveFolders() {
        let fm = FileManager.default
        let root = pendingRootDirectory()
        guard let entries = try? fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return }
        for url in entries where url.hasDirectoryPath {
            try? fm.removeItem(at: url)
        }
    }

    public static func purgeLegacyDocumentsReceived() {
        let legacy = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Received", isDirectory: true)
        guard FileManager.default.fileExists(atPath: legacy.path) else { return }
        try? FileManager.default.removeItem(at: legacy)
    }

    // MARK: - Legacy aliases（呼び出し側の互換）

    public static func makeTempFileURL(fileName: String) -> URL {
        uniqueURL(in: incomingDirectory, fileName: sanitizeFileName(fileName))
    }

    public static func deleteTempFile(at url: URL) {
        if isManagedPendingURL(url) {
            deletePendingReceiveFile(at: url)
        } else {
            deleteIncomingTempFile(at: url)
        }
    }

    public static func purgeAllTempFiles() {
        purgeIncomingTempFiles()
    }

    // MARK: - Private

    private static func pendingRootDirectory() -> URL {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(pendingFolderName, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func isManagedIncomingURL(_ url: URL) -> Bool {
        let root = incomingDirectory.standardizedFileURL.path
        let path = url.standardizedFileURL.path
        return path.hasPrefix(root + "/") || path == root
    }

    private static func isManagedPendingURL(_ url: URL) -> Bool {
        let root = pendingRootDirectory().standardizedFileURL.path
        let path = url.standardizedFileURL.path
        return path.hasPrefix(root + "/")
    }

    private static func isManagedPendingReceiveDirectory(_ url: URL) -> Bool {
        let root = pendingRootDirectory().standardizedFileURL.path
        let path = url.standardizedFileURL.path
        guard path.hasPrefix(root + "/") else { return false }
        let remainder = path.dropFirst(root.count + 1)
        return !remainder.contains("/")
    }

    private static func sanitizeFileName(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = trimmed.isEmpty ? "received-file" : trimmed
        let invalid = CharacterSet(charactersIn: "/\\:\0")
        let cleaned = String(base.unicodeScalars.map { invalid.contains($0) ? "_" : Character($0) })
        return cleaned.isEmpty ? "received-file" : cleaned
    }

    private static func sanitizePathComponent(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = trimmed.isEmpty ? UUID().uuidString : trimmed
        let invalid = CharacterSet(charactersIn: "/\\:\0")
        let cleaned = String(base.unicodeScalars.map { invalid.contains($0) ? "_" : Character($0) })
        return String(cleaned.prefix(120))
    }

    private static func uniqueURL(in dir: URL, fileName: String) -> URL {
        var candidate = dir.appendingPathComponent(fileName)
        if !FileManager.default.fileExists(atPath: candidate.path) { return candidate }
        let base = (fileName as NSString).deletingPathExtension
        let ext = (fileName as NSString).pathExtension
        var i = 1
        while true {
            let name = ext.isEmpty ? "\(base)-\(i)" : "\(base)-\(i).\(ext)"
            candidate = dir.appendingPathComponent(name)
            if !FileManager.default.fileExists(atPath: candidate.path) { return candidate }
            i += 1
        }
    }
}
