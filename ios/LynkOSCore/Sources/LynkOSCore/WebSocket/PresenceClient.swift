import Foundation

public final class PresenceClient: @unchecked Sendable {
    private let client: WebSocketClient
    private var device: DeviceInfo?
    private var onDevicesChanged: (@Sendable () -> Void)?
    private var onDeviceInfo: (@Sendable (RemoteDevice) -> Void)?
    private var onError: (@Sendable (String) -> Void)?

    public var state: ConnectionState { client.state }
    public var lastError: String? { client.lastError }

    public init(session: URLSession? = nil) {
        client = WebSocketClient(label: "presence", session: session)
    }

    public func setOnDevicesChanged(_ handler: (@Sendable () -> Void)?) {
        onDevicesChanged = handler
    }

    public func setOnDeviceInfo(_ handler: (@Sendable (RemoteDevice) -> Void)?) {
        onDeviceInfo = handler
    }

    public func setOnError(_ handler: (@Sendable (String) -> Void)?) {
        onError = handler
    }

    public func connect(config: ServerConfig, device: DeviceInfo) {
        self.device = device
        client.setHandlers(
            onMessage: { [weak self] text in
                self?.handleMessage(text)
            },
            onStateChange: { [weak self] state in
                if state == .connected {
                    self?.sendDeviceInfo()
                    self?.onDevicesChanged?()
                }
            },
            onError: { [weak self] message in
                self?.onError?(message)
            }
        )
        guard let url = config.presenceWebSocketURL() else {
            onError?("[presence] invalid WebSocket URL")
            return
        }
        client.connect(to: url)
    }

    public func disconnect() {
        client.disconnect()
    }

    public func sendDeviceInfo() {
        guard let device else { return }
        var payload: [String: Any] = [
            "deviceId": device.deviceId,
            "name": device.name,
            "type": device.type,
            "platform": device.platform,
        ]
        if let icon = device.icon, !icon.isEmpty {
            payload["icon"] = icon
        }
        try? client.sendJSON([
            "type": "device-info",
            "device": payload,
        ])
    }

    public func updateDevice(_ device: DeviceInfo) {
        self.device = device
        if client.state == .connected {
            sendDeviceInfo()
        }
    }

    private func handleMessage(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = json["type"] as? String
        else {
            onDevicesChanged?()
            return
        }
        switch type {
        case "device-info":
            if let dev = json["device"] as? [String: Any],
               let remote = RemoteDevice(payload: dev) {
                onDeviceInfo?(remote)
            }
        case "devices-changed":
            onDevicesChanged?()
        case "pong":
            break
        default:
            break
        }
    }
}
