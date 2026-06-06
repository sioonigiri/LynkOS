import LynkOSCore
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var viewModel: AppViewModel
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            headerBar
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 18)
                .background(LynkOSTheme.background)

            ScrollView {
                VStack(spacing: 32) {
                    FilePickPanel(
                        pickedFile: viewModel.pickedFile,
                        disabled: viewModel.sendUiBusy,
                        onClear: { viewModel.clearPickedFile() },
                        onPhotoPicked: { item in
                            Task { await viewModel.loadPhotoPickerItem(item) }
                        },
                        onFileURLPicked: { url in
                            viewModel.loadFileURL(url)
                        }
                    )

                    if let toast = viewModel.toastMessage {
                        Text(toast)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(LynkOSTheme.text)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(LynkOSTheme.accentSoft, in: Capsule())
                            .frame(maxWidth: .infinity)
                            .transition(.opacity)
                    }

                    TransferStatusView(
                        activeTransfer: viewModel.activeTransfer,
                        completedRecords: viewModel.receiveHistory
                    )

                    DeviceListView(
                        devices: viewModel.remoteDevices,
                        isOffline: viewModel.isServerOffline,
                        isSearching: viewModel.isSearchingDevices,
                        disabled: viewModel.sendUiBusy,
                        flashDeviceId: viewModel.flashDeviceId,
                        onSelect: { device in
                            viewModel.handleDeviceTap(device)
                        }
                    )

                }
                .padding(.horizontal, 20)
                .padding(.bottom, 48)
            }
            .refreshable {
                await viewModel.refreshDevices()
            }
        }
        .background(LynkOSTheme.background)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(viewModel)
        }
        .overlay {
            if let request = viewModel.incomingRequest {
                ReceiveRequestDialog(
                    request: request,
                    queuedBehind: viewModel.incomingQueueCount,
                    onAccept: { viewModel.acceptIncomingRequest() },
                    onReject: { viewModel.rejectIncomingRequest() }
                )
            }
        }
        .overlay {
            if let pending = viewModel.pendingReceive {
                SaveReceivedFileDialog(
                    file: pending,
                    onSaveToPhotos: {
                        Task { await viewModel.savePendingReceiveToPhotos() }
                    },
                    onSaveToFiles: {
                        viewModel.beginPendingReceiveFilesExport()
                    },
                    onCancel: {
                        viewModel.cancelPendingReceive()
                    }
                )
            }
        }
        .fullScreenCover(item: $viewModel.filesExportRequest) { request in
            DocumentExportHostView(url: request.url) { saved in
                viewModel.handleFilesExportFinished(saved: saved)
            }
            .ignoresSafeArea()
            .background(Color.clear)
        }
    }

    private var headerBar: some View {
        HStack(alignment: .center) {
            LynkOSLogoView()
            Spacer(minLength: 12)
            Button {
                showSettings = true
            } label: {
                HStack(spacing: 7) {
                    DeviceIconBubble(
                        visual: viewModel.localDeviceVisual,
                        diameter: 28
                    )
                    Text(viewModel.deviceName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(LynkOSTheme.textSub)
                        .lineLimit(1)
                        .frame(maxWidth: 120, alignment: .leading)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(LynkOSTheme.surface, in: Capsule())
                .overlay(Capsule().stroke(LynkOSTheme.border, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(LynkOSTheme.border)
                .frame(height: 1)
                .offset(y: 18)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppViewModel())
}
