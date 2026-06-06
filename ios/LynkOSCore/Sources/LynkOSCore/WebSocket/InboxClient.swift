import Foundation

public struct InboxMessage {
    public let raw: [String: Any]
    public let type: String

    public init?(jsonText: String) {
        guard
            let data = jsonText.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = json["type"] as? String
        else {
            return nil
        }
        self.raw = json
        self.type = type
    }
}

public final class InboxClient: @unchecked Sendable {
    public typealias MessageHandler = (InboxMessage) -> Void

    private let client: WebSocketClient
    private var onMessage: MessageHandler?
    private var onError: (@Sendable (String) -> Void)?

    public var state: ConnectionState { client.state }
    public var lastError: String? { client.lastError }

    public init(session: URLSession? = nil) {
        client = WebSocketClient(label: "inbox", session: session)
    }

    public func setOnMessage(_ handler: MessageHandler?) {
        onMessage = handler
    }

    public func setOnError(_ handler: (@Sendable (String) -> Void)?) {
        onError = handler
    }

    public func connect(config: ServerConfig, deviceId: String) {
        client.setHandlers(
            onMessage: { [weak self] text in
                guard let message = InboxMessage(jsonText: text), message.type != "pong" else { return }
                self?.onMessage?(message)
            },
            onStateChange: { _ in },
            onError: { [weak self] message in
                self?.onError?(message)
            }
        )
        guard let url = config.inboxWebSocketURL(deviceId: deviceId) else {
            onError?("[inbox] invalid WebSocket URL")
            return
        }
        client.connect(to: url)
    }

    public func disconnect() {
        client.disconnect()
    }

    public func send(_ payload: [String: Any]) throws {
        try client.sendJSON(payload)
    }
}
