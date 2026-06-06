import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct PickedFileItem: Identifiable, Equatable {
    let id: UUID
    let name: String
    let size: Int64
    let mimeType: String
    let previewImage: UIImage?
    let sourceData: Data?
    let sourceURL: URL?

    var iconEmoji: String {
        if mimeType.hasPrefix("video/") { return "🎬" }
        if mimeType.hasPrefix("image/") { return "🖼" }
        if mimeType.contains("pdf") { return "📄" }
        if mimeType.contains("zip") { return "🗜" }
        return "📄"
    }

    static func == (lhs: PickedFileItem, rhs: PickedFileItem) -> Bool {
        lhs.id == rhs.id
            && lhs.name == rhs.name
            && lhs.size == rhs.size
            && lhs.mimeType == rhs.mimeType
    }
}

struct ImportedPhoto: Transferable {
    let data: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(importedContentType: .image) { data in
            ImportedPhoto(data: data)
        }
    }
}
