import Foundation

public final class SignalingClient: @unchecked Sendable {
    public typealias MessageHandler = @Sendable ([String: Any]) -> Void

    private let client: WebSocketClient
    private var onMessage: MessageHandler?
    private(set) public var roomName: String?

    public var state: ConnectionState { client.state }
    public var lastError: String? { client.lastError }

    public init(session: URLSession? = nil) {
        client = WebSocketClient(label: "signaling", session: session)
    }

    public func setOnMessage(_ handler: MessageHandler?) {
        onMessage = handler
    }

    public func connect(config: ServerConfig, roomName: String) {
        self.roomName = roomName
        client.setHandlers(
            onMessage: { [weak self] text in
                guard
                    let data = text.data(using: .utf8),
                    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                    let type = json["type"] as? String,
                    type != "pong"
                else { return }
                self?.onMessage?(json)
            },
            onStateChange: { _ in },
            onError: { _ in }
        )
        guard let url = config.signalingWebSocketURL(roomName: roomName) else { return }
        client.connect(to: url)
    }

    public func disconnect() {
        roomName = nil
        client.disconnect()
    }

    public func send(_ payload: [String: Any]) throws {
        try client.sendJSON(payload)
    }

    /// Web 版と同じルーム名生成
    public static func roomName(myId: String, peerId: String) -> String {
        [myId, peerId].sorted().joined(separator: "_")
    }
}
