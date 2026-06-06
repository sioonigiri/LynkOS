import Foundation

extension OutboundFilePayload {
    init(from picked: PickedFileItem) {
        self.init(
            name: picked.name,
            size: picked.size,
            mimeType: picked.mimeType,
            sourceData: picked.sourceData,
            sourceURL: picked.sourceURL
        )
    }
}
