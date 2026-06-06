import Foundation

public enum ConnectionState: String, Sendable, Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting

    public var label: String {
        switch self {
        case .disconnected: "切断"
        case .connecting: "接続中"
        case .connected: "接続済み"
        case .reconnecting: "再接続中"
        }
    }
}

public struct ConnectionStatus: Sendable, Equatable {
    public var presence: ConnectionState
    public var inbox: ConnectionState
    public var signaling: ConnectionState
    public var lastError: String?

    public init(
        presence: ConnectionState = .disconnected,
        inbox: ConnectionState = .disconnected,
        signaling: ConnectionState = .disconnected,
        lastError: String? = nil
    ) {
        self.presence = presence
        self.inbox = inbox
        self.signaling = signaling
        self.lastError = lastError
    }
}
