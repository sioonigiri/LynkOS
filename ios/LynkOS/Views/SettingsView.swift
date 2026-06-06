import PhotosUI
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var viewModel: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var draftName: String = ""
    @State private var draftServerURL: String = ""
    @State private var draftDeveloperMode: Bool = false
    @State private var iconPhotoItem: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    previewBubble
                    iconSection
                    nameSection
                    #if DEBUG
                    developerModeSection
                    #endif
                    saveButton
                }
                .padding(20)
            }
            .background(LynkOSTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(LynkOSTheme.textMuted)
                    }
                }
            }
            .onAppear {
                draftName = viewModel.deviceName
                draftServerURL = viewModel.serverOriginInput
                draftDeveloperMode = viewModel.developerModeEnabled
            }
            .onChange(of: iconPhotoItem) { _, newValue in
                guard let newValue else { return }
                Task {
                    await viewModel.applyIconPhotoItem(newValue)
                    iconPhotoItem = nil
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack {
            Text("設定")
                .font(.title2.bold())
                .foregroundStyle(LynkOSTheme.text)
            Spacer()
        }
    }

    private var previewBubble: some View {
        VStack(spacing: 10) {
            DeviceIconBubble(
                visual: DeviceVisual.forLocalDevice(
                    name: draftName,
                    platform: "ios",
                    iconData: viewModel.deviceIconData
                ),
                diameter: 72
            )
            Text(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "—" : draftName)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LynkOSTheme.text)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private var iconSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            fieldLabel("アイコン")
            HStack(spacing: 12) {
                PhotosPicker(selection: $iconPhotoItem, matching: .images) {
                    Text("写真")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(LynkOSTheme.surface2, in: RoundedRectangle(cornerRadius: 12))
                }
                if viewModel.deviceIconData != nil {
                    Button("削除") {
                        viewModel.clearDeviceIcon()
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.red)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(LynkOSTheme.surface2, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            fieldLabel("名前")
            TextField("", text: $draftName)
                .font(.body)
                .padding(14)
                .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(LynkOSTheme.border, lineWidth: 1))
        }
    }

    #if DEBUG
    private var developerModeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: $draftDeveloperMode) {
                Text("デベロッパーモード")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LynkOSTheme.text)
            }
            .tint(LynkOSTheme.accent)

            if draftDeveloperMode {
                fieldLabel("シグナリングサーバー（上書き）")
                TextField("空欄で LAN 自動検出", text: $draftServerURL, axis: .vertical)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .font(.body)
                    .padding(14)
                    .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(LynkOSTheme.border, lineWidth: 1))
                Text("通常は同一 Wi-Fi 上の LynkOS を自動検出します。開発・検証時のみ URL を手入力してください。")
                    .font(.caption)
                    .foregroundStyle(LynkOSTheme.textMuted)
            }
        }
        .padding(14)
        .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(LynkOSTheme.border, lineWidth: 1))
    }
    #endif

    private var saveButton: some View {
        Button {
            viewModel.applySettings(
                name: draftName,
                serverOrigin: draftServerURL,
                developerMode: draftDeveloperMode
            )
            dismiss()
        } label: {
            Text("保存")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .buttonStyle(.borderedProminent)
        .tint(LynkOSTheme.accent)
        .disabled(draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(LynkOSTheme.textSub)
    }
}

#Preview {
    SettingsView()
        .environmentObject(AppViewModel())
}
