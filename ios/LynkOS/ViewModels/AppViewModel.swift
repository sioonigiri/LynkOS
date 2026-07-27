import Combine
import Foundation
import LynkOSCore
import Photos
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

@MainActor
final class AppViewModel: ObservableObject {
    private static let deviceNameKey = "lynkos.deviceName"
    private static let deviceIconKey = "lynkos.deviceIcon"
    private static let developerModeKey = "lynkos.developerMode"
    private static let maxIconBase64Length = 280_000
    /// プロセス内で一度だけ古い受信一時ファイルを掃除する（`.task` 再実行で受信済みファイルを消さない）。
    private static var didPurgeIncomingTempFiles = false

    @Published var serverOriginInput: String
    @Published var deviceName: String
    @Published var deviceIconData: String?
    @Published var developerModeEnabled: Bool
    @Published var deviceId: String = ""
    @Published var status = ConnectionStatus()
    @Published var remoteDevices: [RemoteDevice] = []
    @Published var inboxEvents: [String] = []
    @Published var pickedFile: PickedFileItem?
    @Published var isRefreshingDevices = false
    @Published var isServerOffline = false
    @Published var bootstrapError: String?
    @Published var toastMessage: String?
    @Published private(set) var discoveredHubOrigin: String?
    @Published private(set) var hubDiscoveryHint: String?
    @Published var flashDeviceId: String?

    enum SendPhase: Equatable {
        case idle
        case waitingResponse
        case connecting
        case sending
    }

    struct ActiveTransferDisplay: Equatable {
        let name: String
        let meta: String
        let progress: Int?
        let isSending: Bool
    }

    @Published var sendUiBusy = false
    @Published var sendPhase: SendPhase = .idle
    @Published var sendProgress: Int?
    @Published var sendingFileName: String?
    @Published var incomingRequest: TransferRequest?
    @Published var receiveProgress: Int?
    @Published var receivingFileName: String?
    @Published var pendingReceive: PendingReceivedFile?
    @Published var receiveHistory: [ReceivedFileRecord] = []
    struct FilesExportRequest: Identifiable, Equatable {
        let id = UUID()
        let url: URL
    }

    @Published var filesExportRequest: FilesExportRequest?

    private let hub = LynkOSConnectionHub()
    private let bonjourAdvertiser = BonjourDeviceAdvertiser()
    private let hubDiscovery = BonjourHubDiscovery()
    private var transferSession: WebRTCTransferSession?
    private var incomingQueue: [TransferRequest] = []
    private var statusTimer: AnyCancellable?
    private var devicePollTimer: AnyCancellable?
    private var toastTask: Task<Void, Never>?
    private var lastProgressUpdate = Date.distantPast
    private var lastReportedProgress = -1
    private var pendingSendRequestId: String?
    private var pendingSendPeerId: String?
    private var waitingResponseTimeoutTask: Task<Void, Never>?
    private var lastConnectedOrigin: String?
    /// 写真ピッカー非同期読み込みの世代。送信成功後のクリアで増やし、遅延完了による再設定を防ぐ。
    private var filePickGeneration: UInt64 = 0
    private var photoLoadTask: Task<Void, Never>?

    private enum SendFlowEnd {
        case success
        case preserveSelection
    }

    var activeTransfer: ActiveTransferDisplay? {
        switch sendPhase {
        case .waitingResponse:
            if let file = pickedFile {
                return ActiveTransferDisplay(name: file.name, meta: "許可待ち", progress: nil, isSending: true)
            }
        case .connecting:
            if let file = pickedFile {
                return ActiveTransferDisplay(name: file.name, meta: "接続中", progress: nil, isSending: true)
            }
        case .sending:
            if let file = pickedFile {
                return ActiveTransferDisplay(
                    name: file.name,
                    meta: "送信 \(sendProgress ?? 0)%",
                    progress: sendProgress,
                    isSending: true
                )
            }
        case .idle:
            break
        }
        if sendUiBusy, let name = receivingFileName {
            return ActiveTransferDisplay(
                name: name,
                meta: "受信 \(receiveProgress ?? 0)%",
                progress: receiveProgress,
                isSending: false
            )
        }
        return nil
    }

    var localDeviceVisual: DeviceVisual {
        DeviceVisual.forLocalDevice(
            name: deviceName,
            platform: "ios",
            iconData: deviceIconData
        )
    }

    var isSearchingDevices: Bool {
        !isServerOffline && status.presence == .connected
    }

    var incomingQueueCount: Int {
        incomingQueue.count
    }

    init() {
        let saved = ServerConfig.loadFromUserDefaults()
        deviceIconData = UserDefaults.standard.string(forKey: Self.deviceIconKey)
        developerModeEnabled = DeveloperModeAccess.normalizedDeveloperModeEnabled(
            UserDefaults.standard.bool(forKey: Self.developerModeKey)
        )
        if !DeveloperModeAccess.isAvailable {
            UserDefaults.standard.set(false, forKey: Self.developerModeKey)
        }

        #if targetEnvironment(simulator)
        serverOriginInput = saved.httpOrigin
        #else
        if saved.isLoopback {
            UserDefaults.standard.removeObject(forKey: ServerConfig.userDefaultsKey)
            serverOriginInput = ""
        } else {
            serverOriginInput = saved.httpOrigin
        }
        #endif

        deviceName = UserDefaults.standard.string(forKey: Self.deviceNameKey) ?? UIDevice.current.name
    }

    /// 接続に使うシグナリング URL。
    /// - Release: 同梱クラウド > Bonjour Hub > 保存済み（Web 版と同一サーバー）
    /// - DEBUG: デベロッパー手動 > Bonjour Hub > 同梱 > 保存済み
    var resolvedConfig: ServerConfig {
        #if targetEnvironment(simulator)
        return ServerConfig(httpOrigin: serverOriginInput)
        #else
        if developerModeEnabled, DeveloperModeAccess.isAvailable {
            let manual = serverOriginInput.trimmingCharacters(in: .whitespacesAndNewlines)
            if !manual.isEmpty {
                let config = ServerConfig(httpOrigin: manual, treatEmptyAsUnconfigured: true)
                if config.isConfigured, !config.isLoopback {
                    return config
                }
            }
        }
        if ServerOriginPolicy.prefersBundledCloudOverLanHub,
           let bundled = ServerConfig.bundledDefaultOrigin {
            return ServerConfig(httpOrigin: bundled)
        }
        if let discovered = discoveredHubOrigin {
            return ServerConfig(httpOrigin: discovered)
        }
        if let bundled = ServerConfig.bundledDefaultOrigin {
            return ServerConfig(httpOrigin: bundled)
        }
        let saved = ServerConfig.loadFromUserDefaults()
        if saved.isConfigured, !saved.isLoopback {
            return saved
        }
        return ServerConfig(httpOrigin: "", treatEmptyAsUnconfigured: true)
        #endif
    }

    func bootstrap() async {
        if !Self.didPurgeIncomingTempFiles {
            ReceivedFileStorage.purgeLegacyDocumentsReceived()
            ReceivedFileStorage.purgeOrphanPendingReceiveFolders()
            ReceivedFileStorage.purgeIncomingTempFiles()
            Self.didPurgeIncomingTempFiles = true
        }
        do {
            deviceId = try DeviceIdentity.loadOrCreateDeviceId()
            bootstrapError = nil
            installStatusPolling()
            installDevicePolling()
            startHubDiscovery()
            reconnect()
        } catch {
            bootstrapError = error.localizedDescription
            isServerOffline = true
        }
    }

    func applySettings(name: String, serverOrigin: String, developerMode: Bool) {
        deviceName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        serverOriginInput = serverOrigin.trimmingCharacters(in: .whitespacesAndNewlines)
        let effectiveDeveloperMode = developerMode && DeveloperModeAccess.isAvailable
        developerModeEnabled = effectiveDeveloperMode
        UserDefaults.standard.set(deviceName, forKey: Self.deviceNameKey)
        UserDefaults.standard.set(effectiveDeveloperMode, forKey: Self.developerModeKey)
        saveSettingsAndReconnect()
    }

    func reconnect() {
        bonjourAdvertiser.stop()
        let config = resolvedConfig

        #if !targetEnvironment(simulator)
        guard config.isConfigured, !config.isLoopback else {
            let message =
                "同一 Wi-Fi で PC または Mac の LynkOS（Django）を起動してください。"
            bootstrapError = message
            isServerOffline = true
            hub.stop()
            lastConnectedOrigin = nil
            status = ConnectionStatus(lastError: message)
            return
        }
        #endif

        guard config.isConfigured else {
            bootstrapError = "シグナリングサーバーに接続できません"
            isServerOffline = true
            hub.stop()
            lastConnectedOrigin = nil
            return
        }

        if config.httpOrigin == lastConnectedOrigin,
           status.presence == .connected,
           status.inbox == .connected {
            syncAppGroupSettings()
            bonjourAdvertiser.start(device: currentDeviceInfo())
            return
        }

        config.saveToUserDefaults()
        bootstrapError = nil
        lastConnectedOrigin = config.httpOrigin

        guard !deviceId.isEmpty else { return }

        hub.setHandlers(
            onStatusChange: { [weak self] status in
                Task { @MainActor in
                    self?.status = status
                    self?.updateOfflineState()
                }
            },
            onInboxMessage: { [weak self] message in
                Task { @MainActor in
                    self?.handleInboxMessage(message)
                }
            },
            onDevicesChanged: { [weak self] in
                Task { @MainActor in
                    await self?.refreshDevices()
                }
            },
            onDeviceInfo: { [weak self] device in
                Task { @MainActor in
                    self?.mergeRemoteDevice(device)
                }
            }
        )

        let device = currentDeviceInfo()
        hub.start(config: config, device: device)
        status = hub.currentStatus()
        syncAppGroupSettings()
        bonjourAdvertiser.start(device: device)

        Task {
            await refreshDevices()
        }
    }

    private func syncAppGroupSettings() {
        AppGroupSettings.syncFromMainApp(
            deviceId: deviceId,
            deviceName: deviceName,
            serverConfig: resolvedConfig
        )
    }

    private func startHubDiscovery() {
        #if targetEnvironment(simulator)
        return
        #else
        if ServerOriginPolicy.prefersBundledCloudOverLanHub {
            if let bundled = ServerConfig.bundledDefaultOrigin {
                hubDiscoveryHint = "Hub: \(bundled)"
            }
            return
        }
        hubDiscovery.start { [weak self] hubs in
            Task { @MainActor in
                guard let self else { return }
                if let origin = hubs.first?.httpOrigin {
                    self.discoveredHubOrigin = origin
                    self.hubDiscoveryHint = "Hub: \(origin)"
                    if !self.developerModeEnabled
                        || !DeveloperModeAccess.isAvailable
                        || self.serverOriginInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        self.reconnect()
                    }
                } else if self.discoveredHubOrigin == nil {
                    self.hubDiscoveryHint = "LAN 上の LynkOS サーバーを探索中…"
                }
            }
        }
        #endif
    }

    func saveSettingsAndReconnect() {
        let trimmed = serverOriginInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if developerModeEnabled, DeveloperModeAccess.isAvailable, !trimmed.isEmpty {
            serverOriginInput = ServerConfig.normalizeHTTPOrigin(trimmed)
        }
        reconnect()
    }

    func refreshDevices() async {
        isRefreshingDevices = true
        defer { isRefreshingDevices = false }
        do {
            remoteDevices = try await hub.fetchRemoteDevices()
            isServerOffline = false
            bootstrapError = nil
        } catch {
            isServerOffline = true
            bootstrapError = "デバイス一覧: \(error.localizedDescription)"
        }
    }

    func mergeRemoteDevice(_ device: RemoteDevice) {
        guard device.deviceId != deviceId else { return }
        if let index = remoteDevices.firstIndex(where: { $0.deviceId == device.deviceId }) {
            remoteDevices[index] = device
        } else {
            remoteDevices.append(device)
        }
        isServerOffline = false
        bootstrapError = nil
    }

    func handleDeviceTap(_ device: RemoteDevice) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        flashDeviceId = device.deviceId
        Task {
            try? await Task.sleep(nanoseconds: 240_000_000)
            flashDeviceId = nil
        }
        guard sendPhase == .idle, !sendUiBusy else { return }
        guard let picked = pickedFile else {
            showToast("先にファイルを選択してください")
            return
        }
        guard picked.sourceData != nil || picked.sourceURL != nil else {
            showToast("ファイルを読み込めませんでした")
            return
        }
        sendTransferRequest(to: device, file: picked)
    }

    func clearPickedFile() {
        guard sendPhase == .idle else { return }
        clearOutboundSelection()
    }

    /// 送信対象として保持している UI 状態をすべてクリアする（成功時は必ずここを通す）。
    private func clearOutboundSelection() {
        filePickGeneration += 1
        photoLoadTask?.cancel()
        photoLoadTask = nil
        pickedFile = nil
    }

    private func cancelInFlightPhotoLoad() {
        photoLoadTask?.cancel()
        photoLoadTask = nil
    }

    private func sendTransferRequest(to device: RemoteDevice, file: PickedFileItem) {
        cancelInFlightPhotoLoad()
        let requestId = "tr-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(7))"
        pendingSendRequestId = requestId
        pendingSendPeerId = device.deviceId

        var payload: [String: Any] = [
            "type": "transfer_request",
            "requestId": requestId,
            "from": deviceId,
            "to": device.deviceId,
            "senderName": deviceName,
            "senderType": "mobile",
            "device": ["name": deviceName],
            "files": [[
                "name": file.name,
                "size": file.size,
                "type": file.mimeType,
            ]],
            "file": [
                "name": file.name,
                "size": file.size,
                "type": file.mimeType,
            ],
        ]
        if let icon = deviceIconData, !icon.isEmpty {
            payload["senderIcon"] = icon
            payload["device"] = ["name": deviceName, "icon": icon]
        }

        do {
            try hub.sendInbox(payload)
            sendPhase = .waitingResponse
            sendUiBusy = true
            startWaitingResponseTimeout()
        } catch {
            pendingSendRequestId = nil
            pendingSendPeerId = nil
            showToast("転送リクエストの送信に失敗しました")
        }
    }

    func loadPhotoPickerItem(_ item: PhotosPickerItem) async {
        filePickGeneration += 1
        let loadGeneration = filePickGeneration
        cancelInFlightPhotoLoad()
        let task = Task { [weak self] in
            guard let self else { return }
            do {
                if let imported = try await item.loadTransferable(type: ImportedPhoto.self) {
                    let data = imported.data
                    let preview = ImagePreviewHelper.downscaledPreview(from: data)
                    let name = (item.itemIdentifier?.isEmpty == false ? item.itemIdentifier! : "photo.jpg")
                    let fileName = name.contains(".") ? name : "\(name).jpg"
                    self.applyLoadedPick(
                        generation: loadGeneration,
                        file: PickedFileItem(
                            id: UUID(),
                            name: fileName,
                            size: Int64(data.count),
                            mimeType: "image/jpeg",
                            previewImage: preview,
                            sourceData: data,
                            sourceURL: nil
                        )
                    )
                    return
                }
                if let url = try await item.loadTransferable(type: URL.self) {
                    self.loadFileURL(url, pickGeneration: loadGeneration)
                    return
                }
                await MainActor.run {
                    self.showToast("写真を読み込めませんでした")
                }
            } catch {
                await MainActor.run {
                    guard self.filePickGeneration == loadGeneration else { return }
                    self.showToast("写真を読み込めませんでした")
                }
            }
        }
        photoLoadTask = task
        await task.value
    }

    private func applyLoadedPick(generation: UInt64, file: PickedFileItem) {
        guard filePickGeneration == generation, sendPhase == .idle else { return }
        pickedFile = file
    }

    func loadFileURL(_ url: URL) {
        loadFileURL(url, pickGeneration: nil)
    }

    private func loadFileURL(_ url: URL, pickGeneration: UInt64?) {
        let accessed = url.startAccessingSecurityScopedResource()
        defer {
            if accessed { url.stopAccessingSecurityScopedResource() }
        }
        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .nameKey])
            let size = Int64(values.fileSize ?? 0)
            let mime = values.contentType?.preferredMIMEType ?? "application/octet-stream"
            let name = values.name ?? url.lastPathComponent
            var preview: UIImage?
            if mime.hasPrefix("image/") {
                preview = ImagePreviewHelper.previewFromFileURL(url)
            }
            let file = PickedFileItem(
                id: UUID(),
                name: name,
                size: size,
                mimeType: mime,
                previewImage: preview,
                sourceData: nil,
                sourceURL: url
            )
            if let pickGeneration {
                applyLoadedPick(generation: pickGeneration, file: file)
            } else {
                guard sendPhase == .idle else { return }
                pickedFile = file
            }
        } catch {
            showToast("ファイルを読み込めませんでした")
        }
    }

    func applyIconPhotoItem(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data),
              let jpeg = image.jpegData(compressionQuality: 0.82) else {
            showToast("画像を読み込めませんでした")
            return
        }
        let base64 = jpeg.base64EncodedString()
        let dataURL = "data:image/jpeg;base64,\(base64)"
        guard dataURL.count <= Self.maxIconBase64Length else {
            showToast("画像が大きすぎます")
            return
        }
        deviceIconData = dataURL
        UserDefaults.standard.set(dataURL, forKey: Self.deviceIconKey)
        hub.updateDevice(currentDeviceInfo())
    }

    func clearDeviceIcon() {
        deviceIconData = nil
        UserDefaults.standard.removeObject(forKey: Self.deviceIconKey)
        hub.updateDevice(currentDeviceInfo())
    }

    func testSignalingConnection() {
        let room = SignalingClient.roomName(myId: deviceId, peerId: "phase-a-test-peer")
        hub.connectSignalingTest(roomName: room)
        Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            status = hub.currentStatus()
        }
    }

    func disconnectSignalingTest() {
        hub.disconnectSignaling()
        status = hub.currentStatus()
    }

    func acceptIncomingRequest() {
        guard let request = incomingRequest else { return }
        incomingRequest = nil
        sendUiBusy = true
        do {
            var payload: [String: Any] = [
                "type": "transfer_accept",
                "requestId": request.requestId,
                "from": deviceId,
                "to": request.from,
                "senderName": deviceName,
                "senderType": "mobile",
                "device": ["name": deviceName],
            ]
            if let icon = deviceIconData { payload["senderIcon"] = icon }
            try hub.sendInbox(payload)
            startReceiveTransfer(from: request.from)
        } catch {
            sendUiBusy = false
            showToast("受信開始に失敗しました")
            presentNextIncomingIfNeeded()
        }
    }

    func rejectIncomingRequest() {
        guard let request = incomingRequest else { return }
        incomingRequest = nil
        do {
            try hub.sendInbox([
                "type": "transfer_reject",
                "requestId": request.requestId,
                "from": deviceId,
                "to": request.from,
            ])
        } catch {
            showToast("拒否の送信に失敗しました")
        }
        presentNextIncomingIfNeeded()
    }

    private func handleInboxMessage(_ message: InboxMessage) {
        appendInboxEvent(message.type)

        if message.type == "transfer_accept" {
            handleTransferAccept(message)
            return
        }
        if message.type == "transfer_reject" {
            handleTransferReject(message)
            return
        }

        if message.type == "transfer_request", let request = TransferRequest(message: message) {
            incomingQueue.append(request)
            if incomingRequest == nil {
                incomingRequest = incomingQueue.removeFirst()
            }
        }
    }

    private func handleTransferAccept(_ message: InboxMessage) {
        guard sendPhase == .waitingResponse else { return }
        guard let pendingId = pendingSendRequestId,
              message.raw["requestId"] as? String == pendingId else { return }
        guard let peerId = pendingSendPeerId,
              message.raw["from"] as? String == peerId else { return }
        guard let picked = pickedFile else {
            finishSendFlow()
            return
        }

        pendingSendRequestId = nil
        pendingSendPeerId = nil
        sendPhase = .connecting
        startSendTransfer(to: peerId, file: picked)
    }

    private func handleTransferReject(_ message: InboxMessage) {
        guard sendPhase == .waitingResponse else { return }
        guard let pendingId = pendingSendRequestId,
              message.raw["requestId"] as? String == pendingId else { return }
        showToast("相手が拒否しました")
        finishSendFlow(as: .preserveSelection)
    }

    private func presentNextIncomingIfNeeded() {
        if incomingRequest == nil, !incomingQueue.isEmpty {
            incomingRequest = incomingQueue.removeFirst()
        }
    }

    private func startSendTransfer(to peerId: String, file: PickedFileItem) {
        transferSession?.disconnect()
        lastProgressUpdate = .distantPast
        lastReportedProgress = -1
        let session = WebRTCTransferSession()
        session.delegate = self
        transferSession = session
        let payload = OutboundFilePayload(from: file)
        session.startSend(
            config: resolvedConfig,
            myId: deviceId,
            peerId: peerId,
            file: payload
        )
    }

    private func finishSendFlow(as end: SendFlowEnd = .success) {
        waitingResponseTimeoutTask?.cancel()
        waitingResponseTimeoutTask = nil
        sendPhase = .idle
        sendProgress = nil
        sendingFileName = nil
        pendingSendRequestId = nil
        pendingSendPeerId = nil
        lastReportedProgress = -1
        transferSession?.disconnect()
        transferSession = nil
        switch end {
        case .success:
            clearOutboundSelection()
        case .preserveSelection:
            cancelInFlightPhotoLoad()
        }
        if incomingRequest == nil && receivingFileName == nil {
            sendUiBusy = false
        }
    }

    private func startReceiveTransfer(from peerId: String) {
        transferSession?.disconnect()
        lastProgressUpdate = .distantPast
        lastReportedProgress = -1
        let session = WebRTCTransferSession()
        session.delegate = self
        transferSession = session
        session.startReceive(
            config: resolvedConfig,
            myId: deviceId,
            peerId: peerId
        )
    }

    private func startWaitingResponseTimeout() {
        waitingResponseTimeoutTask?.cancel()
        waitingResponseTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 90_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.sendPhase == .waitingResponse else { return }
                self.showToast("相手からの応答がありませんでした")
                self.finishSendFlow(as: .preserveSelection)
            }
        }
    }

    private func finishReceiveFlow() {
        sendUiBusy = false
        receiveProgress = nil
        receivingFileName = nil
        lastReportedProgress = -1
        transferSession?.disconnect()
        transferSession = nil
        presentNextIncomingIfNeeded()
    }

    func cancelPendingReceive() {
        guard let pending = pendingReceive else { return }
        ReceivedFileStorage.deletePendingReceiveFile(at: pending.tempURL)
        pendingReceive = nil
    }

    func savePendingReceiveToPhotos() async {
        guard let pending = pendingReceive else { return }
        guard pending.isMedia else {
            showToast("このファイルは写真アプリに保存できません")
            return
        }
        let authorized = await requestPhotoLibraryAddAccess()
        guard authorized else {
            showToast("写真へのアクセスが許可されていません")
            return
        }
        do {
            try await performPhotoLibrarySave(url: pending.tempURL, mimeType: pending.mimeType)
            finalizePendingReceive(destination: .photos)
            showToast("\(pending.name) を写真に保存しました")
        } catch {
            showToast("保存に失敗しました")
        }
    }

    func beginPendingReceiveFilesExport() {
        guard let pending = pendingReceive else { return }
        let source = pending.tempURL.standardizedFileURL
        guard ReceivedFileStorage.fileExists(at: source) else {
            showToast("ファイルが見つかりません")
            return
        }
        do {
            let stagingURL = try ReceivedFileStorage.makeDocumentExportStagingCopy(
                sourceURL: source,
                fileName: pending.name
            )
            filesExportRequest = FilesExportRequest(url: stagingURL)
        } catch {
            showToast("ファイルが見つかりません")
        }
    }

    func handleFilesExportFinished(saved: Bool) {
        if let staging = filesExportRequest?.url {
            ReceivedFileStorage.deleteDocumentExportStagingCopy(at: staging)
        }
        filesExportRequest = nil
        guard let pending = pendingReceive else { return }
        if saved {
            finalizePendingReceive(destination: .files)
            showToast("\(pending.name) を保存しました")
        }
    }

    private func finalizePendingReceive(destination: ReceivedFileRecord.SaveDestination) {
        guard let pending = pendingReceive else { return }
        ReceivedFileStorage.deletePendingReceiveFile(at: pending.tempURL)
        appendReceiveHistory(from: pending, destination: destination)
        pendingReceive = nil
    }

    private func appendReceiveHistory(
        from pending: PendingReceivedFile,
        destination: ReceivedFileRecord.SaveDestination
    ) {
        let record = ReceivedFileRecord(
            id: pending.id,
            name: pending.name,
            size: pending.size,
            mimeType: pending.mimeType,
            savedAt: Date(),
            destination: destination
        )
        receiveHistory.insert(record, at: 0)
        if receiveHistory.count > 12 {
            receiveHistory = Array(receiveHistory.prefix(12))
        }
    }

    /// 転送済み一覧（メタデータのみ）をすべて消去する。端末内の実ファイルは触らない。
    func clearReceiveHistory() {
        receiveHistory = []
    }

    private func requestPhotoLibraryAddAccess() async -> Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            return true
        case .notDetermined:
            let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
            return newStatus == .authorized || newStatus == .limited
        default:
            return false
        }
    }

    private func performPhotoLibrarySave(url: URL, mimeType: String) async throws {
        try await PHPhotoLibrary.shared().performChanges {
            if mimeType.hasPrefix("video/") {
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            } else {
                PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: url)
            }
        }
    }

    private func currentDeviceInfo() -> DeviceInfo {
        DeviceInfo(
            deviceId: deviceId,
            name: deviceName,
            type: "mobile",
            platform: "ios",
            icon: deviceIconData
        )
    }

    private func updateOfflineState() {
        if status.presence == .connected || status.inbox == .connected {
            if bootstrapError == nil {
                isServerOffline = false
            }
        } else if status.presence == .reconnecting || status.inbox == .reconnecting {
            // 再接続中はオフライン表示にしない
        } else if status.presence == .disconnected && status.inbox == .disconnected {
            isServerOffline = true
        }
    }

    private func showToast(_ message: String) {
        toastMessage = message
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard !Task.isCancelled else { return }
            toastMessage = nil
        }
    }

    private func installStatusPolling() {
        statusTimer?.cancel()
        statusTimer = Timer.publish(every: 2.5, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self else { return }
                let latest = hub.currentStatus()
                if latest != status {
                    status = latest
                    updateOfflineState()
                }
            }
    }

    private func installDevicePolling() {
        devicePollTimer?.cancel()
        devicePollTimer = Timer.publish(every: 20.0, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, self.status.presence == .connected else { return }
                Task { await self.refreshDevices() }
            }
    }

    private func appendInboxEvent(_ type: String) {
        let stamp = Self.timeFormatter.string(from: Date())
        inboxEvents.insert("[\(stamp)] \(type)", at: 0)
        if inboxEvents.count > 20 {
            inboxEvents = Array(inboxEvents.prefix(20))
        }
    }

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f
    }()
}

extension AppViewModel: WebRTCTransferSessionDelegate {
    func transferSession(_ session: WebRTCTransferSession, didUpdateProgress fileId: String, progress: Int, fileName: String) {
        let now = Date()
        guard progress >= 100
            || progress - lastReportedProgress >= 5
            || now.timeIntervalSince(lastProgressUpdate) >= 0.3
        else { return }
        lastProgressUpdate = now
        lastReportedProgress = progress

        if sendPhase == .connecting || sendPhase == .sending {
            if sendPhase == .connecting {
                sendPhase = .sending
            }
            sendProgress = progress
            sendingFileName = fileName
        } else {
            receiveProgress = progress
            receivingFileName = fileName
        }
    }

    func transferSession(
        _ session: WebRTCTransferSession,
        didCompleteReceive fileName: String,
        savedURL: URL,
        mimeType: String,
        size: Int64
    ) {
        let byteSize = size > 0
            ? size
            : Int64((try? savedURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        guard let handoffURL = ReceivedFileStorage.prepareReceivedFileForHandoff(at: savedURL) else {
            ReceivedFileStorage.deletePendingReceiveFile(at: savedURL)
            showToast("受信ファイルの準備に失敗しました")
            finishReceiveFlow()
            return
        }
        pendingReceive = PendingReceivedFile(
            name: fileName,
            size: byteSize,
            mimeType: mimeType,
            tempURL: handoffURL
        )
        finishReceiveFlow()
    }

    func transferSession(
        _ session: WebRTCTransferSession,
        didCompleteSend fileName: String,
        mimeType: String,
        size: Int64
    ) {
        showToast("\(fileName) を送信しました")
        finishSendFlow(as: .success)
    }

    func transferSession(_ session: WebRTCTransferSession, didFail message: String) {
        if sendPhase != .idle {
            let display = message.contains("切断") || message.contains("接続")
                ? message
                : "送信失敗: \(message)"
            showToast(display)
            finishSendFlow(as: .preserveSelection)
        } else {
            let display =
                message.contains("切断") || message.contains("接続") || message.contains("応答")
                ? message
                : "受信失敗: \(message)"
            showToast(display)
            finishReceiveFlow()
        }
    }
}
