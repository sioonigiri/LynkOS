import ImageIO
import UIKit

enum ImagePreviewHelper {
    static let previewMaxPixelSize: CGFloat = 240

    static func downscaledPreview(from data: Data, maxPixelSize: CGFloat = previewMaxPixelSize) -> UIImage? {
        if let thumbnail = thumbnailFromData(data, maxPixelSize: maxPixelSize) {
            return thumbnail
        }
        guard let source = UIImage(data: data) else { return nil }
        return downscaledPreview(from: source, maxPixelSize: maxPixelSize)
    }

    static func downscaledPreview(from image: UIImage, maxPixelSize: CGFloat = previewMaxPixelSize) -> UIImage? {
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

    static func previewFromFileURL(_ url: URL, maxPixelSize: CGFloat = previewMaxPixelSize) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    private static func thumbnailFromData(_ data: Data, maxPixelSize: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}
