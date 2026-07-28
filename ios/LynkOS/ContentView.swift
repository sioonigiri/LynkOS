import LynkOSCore
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var viewModel: AppViewModel
    @State private var showSettings = false
    @State private var showSupport = false
    @State private var showClearHistoryConfirm = false

    private var showClearHistoryFAB: Bool {
        !viewModel.receiveHistory.isEmpty
            && viewModel.incomingRequest == nil
            && viewModel.pendingReceive == nil
    }

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
                        isRefreshing: viewModel.isRefreshingDevices,
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
        .sheet(isPresented: $showSupport) {
            NavigationStack {
                SupportView()
            }
            .presentationDragIndicator(.visible)
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
        .overlay(alignment: .bottomLeading) {
            supportFAB
                .padding(.leading, 20)
                .padding(.bottom, 20)
        }
        .overlay(alignment: .bottomTrailing) {
            if showClearHistoryFAB {
                clearHistoryFAB
                    .padding(.trailing, 20)
                    .padding(.bottom, 20)
                    .transition(.scale(scale: 0.88).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: showClearHistoryFAB)
        .confirmationDialog(
            "転送済みファイルを消去しますか？",
            isPresented: $showClearHistoryConfirm,
            titleVisibility: .visible
        ) {
            Button("消去", role: .destructive) {
                viewModel.clearReceiveHistory()
            }
            Button("キャンセル", role: .cancel) {}
        }
    }

    private var supportFAB: some View {
        Button {
            showSupport = true
        } label: {
            Text("?")
                .font(.body.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(LynkOSTheme.accent, in: Circle())
                .shadow(color: LynkOSTheme.accent.opacity(0.35), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("サポート")
    }

    private var clearHistoryFAB: some View {
        Button {
            showClearHistoryConfirm = true
        } label: {
            Image(systemName: "trash")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(LynkOSTheme.accent, in: Circle())
                .shadow(color: LynkOSTheme.accent.opacity(0.35), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("転送済みファイルを消去")
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
