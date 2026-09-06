import Foundation

public enum ConnectionState: String, Sendable, Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting

    @MainActor
    public var label: String {
        switch self {
        case .disconnected: L(.connectionStateDisconnected)
        case .connecting: L(.connectionStateConnecting)
        case .connected: L(.connectionStateConnected)
        case .reconnecting: L(.connectionStateReconnecting)
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
