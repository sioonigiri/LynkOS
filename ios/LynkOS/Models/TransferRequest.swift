import Foundation
import LynkOSCore

struct TransferFileMeta: Equatable, Identifiable {
    var id: String { name + ":\(size)" }
    let name: String
    let size: Int64
    let mimeType: String

    init(name: String, size: Int64, mimeType: String) {
        self.name = name
        self.size = size
        self.mimeType = mimeType
    }

    init?(dict: [String: Any]) {
        guard let name = dict["name"] as? String else { return nil }
        let sizeValue: Int64
        if let n = dict["size"] as? NSNumber {
            sizeValue = n.int64Value
        } else if let n = dict["size"] as? Int {
            sizeValue = Int64(n)
        } else {
            sizeValue = 0
        }
        let mime = dict["type"] as? String ?? "application/octet-stream"
        self.init(name: name, size: sizeValue, mimeType: mime)
    }
}

struct TransferRequest: Identifiable, Equatable {
    var id: String { requestId }
    let requestId: String
    let from: String
    let senderName: String
    let senderType: String
    let senderIcon: String?
    let files: [TransferFileMeta]

    @MainActor
    init?(message: InboxMessage) {
        guard message.type == "transfer_request" else { return nil }
        let raw = message.raw
        guard
            let requestId = raw["requestId"] as? String,
            let from = raw["from"] as? String
        else { return nil }

        self.requestId = requestId
        self.from = from
        self.senderName = raw["senderName"] as? String ?? L(.deviceNearbyFallbackName)
        self.senderType = raw["senderType"] as? String ?? "desktop"
        self.senderIcon = (raw["senderIcon"] as? String) ?? (raw["device"] as? [String: Any])?["icon"] as? String

        if let list = raw["files"] as? [[String: Any]] {
            self.files = list.compactMap(TransferFileMeta.init(dict:))
        } else if let single = raw["file"] as? [String: Any], let meta = TransferFileMeta(dict: single) {
            self.files = [meta]
        } else {
            self.files = []
        }
    }
}
