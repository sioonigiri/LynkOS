import LynkOSCore
import UIKit
import UniformTypeIdentifiers

struct SharedAttachmentPreview: Equatable {
    let fileName: String
    let mimeType: String
    let size: Int64
    let thumbnail: UIImage?
    let stagedURL: URL?
    let stagedData: Data?
}

enum SharedAttachmentLoader {
    static func load(from items: [NSExtensionItem]) async -> SharedAttachmentPreview? {
        for item in items {
            for provider in item.attachments ?? [] {
                if let preview = await loadProvider(provider) {
                    return preview
                }
            }
        }
        return nil
    }

    private static func loadProvider(_ provider: NSItemProvider) async -> SharedAttachmentPreview? {
        let suggestedName = provider.suggestedName

        if provider.canLoadObject(ofClass: UIImage.self) {
            if let preview = await loadUIImage(provider, suggestedName: suggestedName) {
                return preview
            }
        }

        var typeIds = provider.registeredTypeIdentifiers
        let fallbacks = [
            UTType.image.identifier,
            UTType.heic.identifier,
            UTType.jpeg.identifier,
            UTType.plainText.identifier,
            UTType.movie.identifier,
            UTType.pdf.identifier,
            UTType.data.identifier,
            UTType.item.identifier,
        ]
        for typeId in fallbacks where !typeIds.contains(typeId) {
            typeIds.append(typeId)
        }

        for typeId in typeIds where provider.hasItemConformingToTypeIdentifier(typeId) {
            if let preview = await loadFileRepresentation(typeId: typeId, suggestedName: suggestedName, provider: provider) {
                return preview
            }
            if let preview = await loadDataRepresentation(typeId: typeId, suggestedName: suggestedName, provider: provider) {
                return preview
            }
        }
        return nil
    }

    private static func loadUIImage(_ provider: NSItemProvider, suggestedName: String?) async -> SharedAttachmentPreview? {
        await withCheckedContinuation { continuation in
            provider.loadObject(ofClass: UIImage.self) { object, _ in
                guard let image = object as? UIImage,
                      let data = image.jpegData(compressionQuality: 0.88) else {
                    continuation.resume(returning: nil)
                    return
                }
                let name = suggestedName ?? "photo.jpg"
                let fileName = name.contains(".") ? name : "\(name).jpg"
                continuation.resume(returning: SharedAttachmentPreview(
                    fileName: fileName,
                    mimeType: "image/jpeg",
                    size: Int64(data.count),
                    thumbnail: image,
                    stagedURL: nil,
                    stagedData: data
                ))
            }
        }
    }

    private static func loadFileRepresentation(
        typeId: String,
        suggestedName: String?,
        provider: NSItemProvider
    ) async -> SharedAttachmentPreview? {
        await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: typeId) { url, _ in
                guard let url else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: makePreview(from: url, suggestedName: suggestedName, typeId: typeId))
            }
        }
    }

    private static func loadDataRepresentation(
        typeId: String,
        suggestedName: String?,
        provider: NSItemProvider
    ) async -> SharedAttachmentPreview? {
        await withCheckedContinuation { continuation in
            provider.loadDataRepresentation(forTypeIdentifier: typeId) { data, _ in
                guard let data, !data.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                let mime = UTType(typeId)?.preferredMIMEType ?? "application/octet-stream"
                let name = suggestedName ?? defaultName(for: typeId)
                var thumb: UIImage?
                if mime.hasPrefix("image/"), let image = UIImage(data: data) {
                    thumb = downscaledThumbnail(image)
                }
                continuation.resume(returning: SharedAttachmentPreview(
                    fileName: name,
                    mimeType: mime,
                    size: Int64(data.count),
                    thumbnail: thumb,
                    stagedURL: nil,
                    stagedData: data
                ))
            }
        }
    }

    private static func makePreview(from url: URL, suggestedName: String?, typeId: String) -> SharedAttachmentPreview? {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .nameKey])
        let mime = values?.contentType?.preferredMIMEType ?? UTType(typeId)?.preferredMIMEType ?? "application/octet-stream"
        let name = suggestedName ?? values?.name ?? url.lastPathComponent
        let size = Int64(values?.fileSize ?? 0)
        var thumb: UIImage?
        if mime.hasPrefix("image/") {
            if let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
                thumb = downscaledThumbnail(image)
            }
        }
        guard let staged = try? stageInAppGroup(from: url, fileName: name) else {
            if let data = try? Data(contentsOf: url) {
                return SharedAttachmentPreview(
                    fileName: name,
                    mimeType: mime,
                    size: Int64(data.count),
                    thumbnail: thumb,
                    stagedURL: nil,
                    stagedData: data
                )
            }
            return nil
        }
        return SharedAttachmentPreview(
            fileName: name,
            mimeType: mime,
            size: size > 0 ? size : Int64((try? staged.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0),
            thumbnail: thumb,
            stagedURL: staged,
            stagedData: nil
        )
    }

    private static func stageInAppGroup(from url: URL, fileName: String) throws -> URL {
        guard let base = AppGroupContainer.containerURL() else {
            throw ShareInboxError.appGroupUnavailable
        }
        let dir = base.appendingPathComponent("ShareStaging", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let dest = dir.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: url, to: dest)
        return dest
    }

    private static func defaultName(for typeId: String) -> String {
        if typeId == UTType.plainText.identifier { return "shared.txt" }
        if let ext = UTType(typeId)?.preferredFilenameExtension {
            return "shared.\(ext)"
        }
        return "shared-file"
    }

    private static func downscaledThumbnail(_ image: UIImage, maxPixelSize: CGFloat = 120) -> UIImage {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return image }
        let scale = min(maxPixelSize / size.width, maxPixelSize / size.height, 1)
        if scale >= 1 { return image }
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: newSize, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
