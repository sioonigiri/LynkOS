import Foundation

/// Presence / Inbox / HTTP 登録をまとめて管理する Phase A 用ハブ。
public final class LynkOSConnectionHub: @unchecked Sendable {
    public typealias StatusHandler = @Sendable (ConnectionStatus) -> Void
    public typealias DevicesChangedHandler = @Sendable () -> Void
    public typealias DeviceInfoHandler = @Sendable (RemoteDevice) -> Void

    private let presence = PresenceClient()
    private let inbox = InboxClient()
    private let signaling = SignalingClient()
    private let registration = DeviceRegistrationService()

    private var config: ServerConfig?
    private var device: DeviceInfo?
    private var heartbeatTask: Task<Void, Never>?
    private var onStatusChange: StatusHandler?
    private var onInboxMessage: InboxClient.MessageHandler?
    private var onDevicesChanged: DevicesChangedHandler?
    private var onDeviceInfo: DeviceInfoHandler?

    private var status = ConnectionStatus() {
        didSet {
            guard oldValue != status else { return }
            let handler = onStatusChange
            let snapshot = status
            if let handler {
                DispatchQueue.main.async {
                    handler(snapshot)
                }
            }
        }
    }

    public init() {}

    public func setHandlers(
        onStatusChange: StatusHandler?,
        onInboxMessage: InboxClient.MessageHandler? = nil,
        onDevicesChanged: DevicesChangedHandler? = nil,
        onDeviceInfo: DeviceInfoHandler? = nil
    ) {
        self.onStatusChange = onStatusChange
        self.onInboxMessage = onInboxMessage
        self.onDevicesChanged = onDevicesChanged
        self.onDeviceInfo = onDeviceInfo
        inbox.setOnMessage { [weak self] message in
            self?.onInboxMessage?(message)
        }
    }

    public func start(config: ServerConfig, device: DeviceInfo) {
        stop()
        self.config = config
        self.device = device

        let errorSink: @Sendable (String) -> Void = { [weak self] message in
            self?.refreshStatus(lastError: message)
        }

        presence.setOnDevicesChanged { [weak self] in
            self?.onDevicesChanged?()
            self?.refreshStatus()
        }
        presence.setOnDeviceInfo { [weak self] device in
            self?.onDeviceInfo?(device)
        }
        presence.setOnError(errorSink)

        inbox.setOnMessage { [weak self] message in
            self?.onInboxMessage?(message)
        }
        inbox.setOnError(errorSink)

        presence.connect(config: config, device: device)
        inbox.connect(config: config, deviceId: device.deviceId)
        refreshStatus()

        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 22_000_000_000)
                guard !Task.isCancelled else { break }
                await self?.heartbeat()
            }
        }

        Task {
            await heartbeat()
        }
    }

    public func stop() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        signaling.disconnect()
        inbox.disconnect()
        presence.disconnect()
        if let device, let config {
            Task {
                await registration.unregister(deviceId: device.deviceId, config: config)
            }
        }
        status = ConnectionStatus()
    }

    public func updateDeviceName(_ name: String) {
        guard var device else { return }
        device.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !device.name.isEmpty else { return }
        self.device = device
        presence.updateDevice(device)
        Task { await heartbeat() }
    }

    public func updateDevice(_ info: DeviceInfo) {
        device = info
        presence.updateDevice(info)
        Task { await heartbeat() }
    }

    /// Phase A: シグナリング WS の接続テスト（ルーム名を指定）
    public func connectSignalingTest(roomName: String) {
        guard let config else { return }
        signaling.disconnect()
        signaling.connect(config: config, roomName: roomName)
        refreshStatus()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.refreshStatus()
        }
    }

    public func disconnectSignaling() {
        signaling.disconnect()
        refreshStatus()
    }

    public func fetchRemoteDevices() async throws -> [RemoteDevice] {
        guard let config, let device else { return [] }
        let all = try await registration.fetchDevices(config: config)
        return all.filter { $0.deviceId != device.deviceId }
    }

    public func currentDevice() -> DeviceInfo? {
        device
    }

    public func currentStatus() -> ConnectionStatus {
        status
    }

    public func sendInbox(_ payload: [String: Any]) throws {
        try inbox.send(payload)
    }

    // MARK: - Private

    private func heartbeat() async {
        guard let config, let device else { return }
        do {
            try await registration.register(device: device, config: config)
            presence.sendDeviceInfo()
            refreshStatus(lastError: nil)
        } catch {
            refreshStatus(lastError: error.localizedDescription)
        }
    }

    private func refreshStatus(lastError: String? = nil) {
        status = ConnectionStatus(
            presence: presence.state,
            inbox: inbox.state,
            signaling: signaling.state,
            lastError: lastError ?? status.lastError
        )
    }
}
