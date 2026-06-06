import Foundation

struct OutboundFilePayload {
    let id: String
    let name: String
    let size: Int64
    let mimeType: String
    let sourceData: Data?
    let sourceURL: URL?

    init(
        id: String = "f-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(7))",
        name: String,
        size: Int64,
        mimeType: String,
        sourceData: Data?,
        sourceURL: URL?
    ) {
        self.id = id
        self.name = name
        self.size = size
        self.mimeType = mimeType
        self.sourceData = sourceData
        self.sourceURL = sourceURL
    }
}
