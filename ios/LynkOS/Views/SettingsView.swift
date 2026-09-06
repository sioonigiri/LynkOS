import LynkOSCore
import PhotosUI
import SwiftUI

struct SettingsView: View {
    @ObservedObject private var loc = LocalizationManager.shared
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
            Text(L(.settingsTitle))
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
        let photoButtonTitle = L(.settingsPhotoButton)
        return VStack(alignment: .leading, spacing: 10) {
            fieldLabel(L(.settingsIconLabel))
            HStack(spacing: 12) {
                PhotosPicker(selection: $iconPhotoItem, matching: .images) {
                    Text(photoButtonTitle)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(LynkOSTheme.surface2, in: RoundedRectangle(cornerRadius: 12))
                }
                if viewModel.deviceIconData != nil {
                    Button(L(.commonDelete)) {
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
            fieldLabel(L(.settingsNameLabel))
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
                Text(L(.settingsDeveloperMode))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LynkOSTheme.text)
            }
            .tint(LynkOSTheme.accent)

            if draftDeveloperMode {
                fieldLabel(L(.settingsSignalingOverrideLabel))
                TextField(L(.settingsServerPlaceholder), text: $draftServerURL, axis: .vertical)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .font(.body)
                    .padding(14)
                    .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(LynkOSTheme.border, lineWidth: 1))
                Text(L(.settingsServerHint))
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
            Text(L(.commonSave))
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
