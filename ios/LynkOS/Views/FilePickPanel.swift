import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct FilePickPanel: View {
    let pickedFile: PickedFileItem?
    let disabled: Bool
    let onClear: () -> Void
    let onPhotoPicked: (PhotosPickerItem) -> Void
    let onFileURLPicked: (URL) -> Void

    @State private var photoItem: PhotosPickerItem?
    @State private var showSourcePicker = false
    @State private var showPhotosPicker = false
    @State private var showFileImporter = false

    var body: some View {
        Button {
            guard !disabled else { return }
            showSourcePicker = true
        } label: {
            panelContent
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .confirmationDialog("選択", isPresented: $showSourcePicker, titleVisibility: .visible) {
            Button("写真・動画") {
                showPhotosPicker = true
            }
            Button("ファイル") {
                showFileImporter = true
            }
            if pickedFile != nil {
                Button("選択を解除", role: .destructive) {
                    onClear()
                }
            }
            Button("キャンセル", role: .cancel) {}
        }
        .photosPicker(
            isPresented: $showPhotosPicker,
            selection: $photoItem,
            matching: .any(of: [.images, .videos])
        )
        .onChange(of: photoItem) { _, newValue in
            guard let newValue else { return }
            onPhotoPicked(newValue)
            photoItem = nil
        }
        .onChange(of: pickedFile) { _, newValue in
            if newValue == nil {
                photoItem = nil
            }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                onFileURLPicked(url)
            }
        }
    }

    private var panelContent: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14)
                .fill(LynkOSTheme.surface)
                .overlay {
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(
                            pickedFile == nil ? LynkOSTheme.border : LynkOSTheme.accent.opacity(0.5),
                            style: StrokeStyle(
                                lineWidth: 2,
                                dash: pickedFile == nil ? [8, 6] : []
                            )
                        )
                }

            if let file = pickedFile {
                pickedPreview(file)
            } else if disabled {
                VStack(spacing: 8) {
                    Text("⏳")
                        .font(.title)
                    Text("待機")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LynkOSTheme.textSub)
                }
            } else {
                Text("画像・ファイルを選択")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(LynkOSTheme.textSub)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: pickedFile == nil ? 120 : 108)
        .contentShape(RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private func pickedPreview(_ file: PickedFileItem) -> some View {
        HStack(spacing: 12) {
            Group {
                if let image = file.previewImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Text(file.iconEmoji)
                        .font(.system(size: 32))
                }
            }
            .frame(width: 72, height: 72)
            .background(LynkOSTheme.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 4) {
                Text(file.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LynkOSTheme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(PendingReceivedFile.formatBytes(file.size))
                    .font(.caption)
                    .foregroundStyle(LynkOSTheme.textSub)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
    }
}
