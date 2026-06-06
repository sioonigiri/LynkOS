import Foundation

/// Share Extension 向けの軽量デバイス探索（HTTP + Presence WS）。
public final class ExtensionDeviceDiscovery: @unchecked Sendable {
    public typealias UpdateHandler = @Sendable ([RemoteDevice]) -> Void

    private let registration = DeviceRegistrationService()
    private let presence = PresenceClient()
    private var config: ServerConfig?
    private var localDeviceId: String = ""
    private var pollTask: Task<Void, Never>?
    private var onUpdate: UpdateHandler?

    public init() {}

    public func start(
        config: ServerConfig,
        localDeviceId: String,
        localDeviceName: String,
        onUpdate: @escaping UpdateHandler
    ) {
        stop()
        self.config = config
        self.localDeviceId = localDeviceId
        self.onUpdate = onUpdate

        let device = DeviceInfo(
            deviceId: localDeviceId,
            name: localDeviceName,
            type: "mobile",
            platform: "ios-share"
        )

        presence.setOnDevicesChanged { [weak self] in
            Task { await self?.refresh() }
        }
        presence.setOnDeviceInfo { [weak self] _ in
            Task { await self?.refresh() }
        }
        presence.setOnError { _ in }

        presence.connect(config: config, device: device)

        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }

        Task { await refresh() }
    }

    public func stop() {
        pollTask?.cancel()
        pollTask = nil
        presence.disconnect()
        config = nil
        onUpdate = nil
    }

    public func refresh() async {
        guard let config else { return }
        do {
            let all = try await registration.fetchDevices(config: config)
            let filtered = all.filter { $0.deviceId != localDeviceId }
            dispatchUpdate(filtered)
        } catch {
            dispatchUpdate([])
        }
    }

    private func dispatchUpdate(_ devices: [RemoteDevice]) {
        let handler = onUpdate
        let snapshot = devices
        DispatchQueue.main.async {
            handler?(snapshot)
        }
    }
}
