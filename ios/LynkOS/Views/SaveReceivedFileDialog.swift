import SwiftUI

struct SaveReceivedFileDialog: View {
    let file: PendingReceivedFile
    let onSaveToPhotos: () -> Void
    let onSaveToFiles: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.35)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Text("保存先を選択")
                    .font(.headline)
                    .foregroundStyle(LynkOSTheme.text)

                HStack(spacing: 12) {
                    Text(file.iconEmoji)
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(file.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LynkOSTheme.text)
                            .lineLimit(2)
                        Text(PendingReceivedFile.formatBytes(file.size))
                            .font(.caption)
                            .foregroundStyle(LynkOSTheme.textSub)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .background(LynkOSTheme.surface2, in: RoundedRectangle(cornerRadius: 12))

                VStack(spacing: 10) {
                    if file.isMedia {
                        Button(action: onSaveToPhotos) {
                            Label("写真アプリに保存", systemImage: "photo.on.rectangle.angled")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(LynkOSTheme.accent)
                    }

                    if file.isMedia {
                        Button(action: onSaveToFiles) {
                            Label("ファイルアプリに保存", systemImage: "folder")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(LynkOSTheme.accent)
                    } else {
                        Button(action: onSaveToFiles) {
                            Label("ファイルアプリに保存", systemImage: "folder")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(LynkOSTheme.accent)
                    }

                    Button("キャンセル", role: .cancel, action: onCancel)
                        .font(.subheadline)
                        .foregroundStyle(LynkOSTheme.textSub)
                }
            }
            .padding(24)
            .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            .padding(.horizontal, 28)
        }
    }
}
