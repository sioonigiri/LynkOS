import Combine
import Foundation
import LynkOSCore
import UIKit

@MainActor
final class ShareExtensionViewModel: ObservableObject {
    enum ScreenState: Equatable {
        case loadingAttachment
        case needsMainAppSetup
        case searching
        case ready
        case attachmentError(String)
        case waitingAccept(peerName: String)
        case connecting(peerName: String)
        case sending(peerName: String, progress: Int)
        case completed
        case rejected
        case transferError(String)
    }

    struct DeviceRow: Identifiable, Equatable {
        let id: String
        let name: String
        let platform: String
        let type: String
        let source: Source

        enum Source: Equatable {
            case server
            case bonjour
        }

        /// HTTP 一覧、または Bonjour TXT に deviceId がある端末のみ送信可。
        var isTransferable: Bool {
            !id.hasPrefix("bonjour:")
        }
    }

    @Published private(set) var screenState: ScreenState = .loadingAttachment
    @Published private(set) var attachment: SharedAttachmentPreview?
    @Published private(set) var devices: [DeviceRow] = []
    @Published private(set) var bonjourHint: String?
    @Published var selectedDeviceId: String?

    private weak var extensionContext: NSExtensionContext?
    private let discovery = ExtensionDeviceDiscovery()
    private let bonjour = BonjourDeviceDiscovery()
    private let inbox = InboxClient()
    private var transferSession: WebRTCTransferSession?

    private var serverConfig: ServerConfig?
    private var localDeviceId = ""
    private var localDeviceName = ""
    private var serverDevices: [RemoteDevice] = []
    private var bonjourDevices: [BonjourDeviceDiscovery.DiscoveredDevice] = []

    private var pendingSendRequestId: String?
    private var pendingSendPeerId: String?
    private var acceptTimeoutTask: Task<Void, Never>?

    init(extensionContext: NSExtensionContext?) {
        self.extensionContext = extensionContext
    }

    func start(with items: [NSExtensionItem]) async {
        guard AppGroupSettings.isAppGroupAvailable else {
            screenState = .needsMainAppSetup
            return
        }

        attachment = await SharedAttachmentLoader.load(from: items)
        guard attachment != nil else {
            screenState = .attachmentError("共有内容を読み込めませんでした")
            return
        }

        var config = AppGroupSettings.loadServerConfig()
        if !config.isConfigured || config.isLoopback {
            if let hub = await BonjourHubDiscovery.discoverFirstHub() {
                config = ServerConfig(httpOrigin: hub.httpOrigin)
            } else {
                screenState = .needsMainAppSetup
                return
            }
        }

        serverConfig = config
        localDeviceId = AppGroupSettings.loadDeviceId() ?? "ios-share-\(UUID().uuidString.prefix(8))"
        localDeviceName = AppGroupSettings.loadDeviceName()

        inbox.setOnMessage { [weak self] message in
            Task { @MainActor in
                self?.handleInboxMessage(message)
            }
        }
        inbox.connect(config: config, deviceId: localDeviceId)

        screenState = .searching
        startBonjourDiscovery()
        discovery.start(config: config, localDeviceId: localDeviceId, localDeviceName: localDeviceName) { [weak self] devices in
            Task { @MainActor in
                self?.serverDevices = devices
                self?.mergeDeviceRows()
            }
        }
    }

    func cancel() {
        acceptTimeoutTask?.cancel()
        acceptTimeoutTask = nil
        transferSession?.disconnect()
        transferSession = nil
        discovery.stop()
        bonjour.stop()
        inbox.disconnect()
        extensionContext?.cancelRequest(withError: NSError(domain: "LynkOS", code: 0))
    }

    func selectDevice(_ device: DeviceRow) {
        guard device.isTransferable else { return }
        guard let attachment else { return }
        guard attachment.stagedData != nil || attachment.stagedURL != nil else {
            screenState = .transferError("ファイルを読み込めませんでした")
            return
        }
        guard !isTransferActive else { return }

        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        selectedDeviceId = device.id
        Task { await beginTransfer(to: device, attachment: attachment) }
    }

    func dismissAfterComplete() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    func cleanup() {
        acceptTimeoutTask?.cancel()
        acceptTimeoutTask = nil
        transferSession?.disconnect()
        transferSession = nil
        discovery.stop()
        bonjour.stop()
        inbox.disconnect()
    }

    private var isTransferActive: Bool {
        switch screenState {
        case .waitingAccept, .connecting, .sending:
            return true
        default:
            return false
        }
    }

    private func beginTransfer(to device: DeviceRow, attachment: SharedAttachmentPreview) async {
        guard serverConfig != nil else { return }

        discovery.stop()
        bonjour.stop()

        let requestId = "tr-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(7))"
        pendingSendRequestId = requestId
        pendingSendPeerId = device.id

        let payload: [String: Any] = [
            "type": "transfer_request",
            "requestId": requestId,
            "from": localDeviceId,
            "to": device.id,
            "senderName": localDeviceName,
            "senderType": "mobile",
            "device": ["name": localDeviceName],
            "files": [[
                "name": attachment.fileName,
                "size": attachment.size,
                "type": attachment.mimeType,
            ]],
            "file": [
                "name": attachment.fileName,
                "size": attachment.size,
                "type": attachment.mimeType,
            ],
        ]

        screenState = .waitingAccept(peerName: device.name)
        startAcceptTimeout(peerName: device.name)

        guard await waitForInboxConnected() else {
            resetTransferState()
            screenState = .transferError("サーバーに接続できません")
            return
        }

        do {
            try inbox.send(payload)
        } catch {
            resetTransferState()
            screenState = .transferError("転送リクエストの送信に失敗しました")
        }
    }

    private func handleInboxMessage(_ message: InboxMessage) {
        switch message.type {
        case "transfer_accept":
            handleTransferAccept(message)
        case "transfer_reject":
            handleTransferReject(message)
        default:
            break
        }
    }

    private func handleTransferAccept(_ message: InboxMessage) {
        guard case .waitingAccept = screenState else { return }
        guard let pendingId = pendingSendRequestId,
              message.raw["requestId"] as? String == pendingId else { return }
        guard let peerId = pendingSendPeerId,
              message.raw["from"] as? String == peerId else { return }
        guard let attachment else {
            resetTransferState()
            screenState = .transferError("共有ファイルが見つかりません")
            return
        }

        acceptTimeoutTask?.cancel()
        acceptTimeoutTask = nil
        pendingSendRequestId = nil
        pendingSendPeerId = nil

        let peerName: String
        if case let .waitingAccept(name) = screenState {
            peerName = name
        } else {
            peerName = "デバイス"
        }

        screenState = .connecting(peerName: peerName)
        startSendTransfer(to: peerId, attachment: attachment)
    }

    private func handleTransferReject(_ message: InboxMessage) {
        guard case .waitingAccept = screenState else { return }
        guard let pendingId = pendingSendRequestId,
              message.raw["requestId"] as? String == pendingId else { return }

        acceptTimeoutTask?.cancel()
        acceptTimeoutTask = nil
        resetTransferState()
        screenState = .rejected
    }

    private func startSendTransfer(to peerId: String, attachment: SharedAttachmentPreview) {
        guard let config = serverConfig else { return }

        transferSession?.disconnect()
        let session = WebRTCTransferSession()
        session.delegate = self
        transferSession = session

        let payload = OutboundFilePayload(
            name: attachment.fileName,
            size: attachment.size,
            mimeType: attachment.mimeType,
            sourceData: attachment.stagedData,
            sourceURL: attachment.stagedURL
        )
        session.startSend(config: config, myId: localDeviceId, peerId: peerId, file: payload)
    }

    private func startAcceptTimeout(peerName: String) {
        acceptTimeoutTask?.cancel()
        acceptTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 90_000_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, case .waitingAccept = self.screenState else { return }
                self.resetTransferState()
                self.screenState = .transferError("\(peerName) からの応答がありませんでした")
            }
        }
    }

    private func resetTransferState() {
        acceptTimeoutTask?.cancel()
        acceptTimeoutTask = nil
        pendingSendRequestId = nil
        pendingSendPeerId = nil
        transferSession?.disconnect()
        transferSession = nil
        selectedDeviceId = nil
    }

    private func waitForInboxConnected(timeoutSeconds: TimeInterval = 10) async -> Bool {
        if inbox.state == .connected { return true }
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        while Date() < deadline {
            if inbox.state == .connected { return true }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        return inbox.state == .connected
    }

    private func startBonjourDiscovery() {
        bonjour.start { [weak self] found in
            Task { @MainActor in
                self?.bonjourDevices = found
                self?.bonjourHint = found.isEmpty
                    ? "Bonjour: 近くの LynkOS を探索中…"
                    : "Bonjour: \(found.count) 件"
                self?.mergeDeviceRows()
            }
        }
    }

    private func mergeDeviceRows() {
        var rows: [DeviceRow] = serverDevices.map {
            DeviceRow(
                id: $0.deviceId,
                name: $0.name,
                platform: $0.platform,
                type: $0.type,
                source: .server
            )
        }

        let knownIds = Set(rows.map(\.id))
        for bonjourDevice in bonjourDevices {
            if let deviceId = bonjourDevice.txtDeviceId, knownIds.contains(deviceId) {
                continue
            }
            let rowId = bonjourDevice.txtDeviceId ?? "bonjour:\(bonjourDevice.endpointDescription)"
            if rows.contains(where: { $0.id == rowId }) { continue }
            rows.append(DeviceRow(
                id: rowId,
                name: bonjourDevice.name,
                platform: bonjourDevice.txtPlatform ?? "bonjour",
                type: "unknown",
                source: .bonjour
            ))
        }

        devices = rows.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        if !isTransferActive {
            screenState = .ready
        }
    }
}

extension ShareExtensionViewModel: WebRTCTransferSessionDelegate {
    func transferSession(
        _ session: WebRTCTransferSession,
        didUpdateProgress fileId: String,
        progress: Int,
        fileName: String
    ) {
        let peerName: String
        switch screenState {
        case .connecting(let name):
            peerName = name
            screenState = .sending(peerName: name, progress: progress)
        case .sending(let name, _):
            peerName = name
        default:
            peerName = "デバイス"
        }
        screenState = .sending(peerName: peerName, progress: progress)
    }

    func transferSession(
        _ session: WebRTCTransferSession,
        didCompleteReceive fileName: String,
        savedURL: URL,
        mimeType: String,
        size: Int64
    ) {}

    func transferSession(
        _ session: WebRTCTransferSession,
        didCompleteSend fileName: String,
        mimeType: String,
        size: Int64
    ) {
        transferSession = nil
        screenState = .completed
    }

    func transferSession(_ session: WebRTCTransferSession, didFail message: String) {
        resetTransferState()
        screenState = .transferError(
            message.contains("切断") || message.contains("接続") || message.contains("応答")
                ? message
                : "送信失敗: \(message)"
        )
    }
}
