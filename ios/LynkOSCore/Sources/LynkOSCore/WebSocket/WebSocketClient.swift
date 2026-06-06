import Foundation

public enum WebSocketClientError: Error, LocalizedError {
    case notConnected
    case encodingFailed

    public var errorDescription: String? {
        switch self {
        case .notConnected:
            "WebSocket is not connected"
        case .encodingFailed:
            "Failed to encode message"
        }
    }
}

/// URLSessionWebSocketTask ベースの WebSocket クライアント（再接続・ping 対応）。
public final class WebSocketClient: @unchecked Sendable {
    public typealias MessageHandler = @Sendable (String) -> Void
    public typealias StateHandler = @Sendable (ConnectionState) -> Void
    public typealias ErrorHandler = @Sendable (String) -> Void

    private let label: String
    private let session: URLSession
    private var task: URLSessionWebSocketTask?
    private var url: URL?
    private var receiveLoopTask: Task<Void, Never>?
    private var pingLoopTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var shouldStayConnected = false
    private var isOpening = false
    private var hasEstablishedSession = false
    private var backoffSeconds: TimeInterval = 1.5
    private let maxBackoffSeconds: TimeInterval = 12
    private let pingIntervalSeconds: TimeInterval = 20
    private let queue = DispatchQueue(label: "com.lynkos.websocket", qos: .userInitiated)

    private var onMessage: MessageHandler?
    private var onStateChange: StateHandler?
    private var onError: ErrorHandler?

    public private(set) var state: ConnectionState = .disconnected {
        didSet {
            guard oldValue != state else { return }
            let handler = onStateChange
            let newState = state
            if let handler {
                DispatchQueue.main.async {
                    handler(newState)
                }
            }
        }
    }

    public private(set) var lastError: String?

    public init(label: String, session: URLSession? = nil) {
        self.label = label
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.waitsForConnectivity = true
            config.timeoutIntervalForRequest = 30
            self.session = URLSession(configuration: config)
        }
    }

    public func setHandlers(
        onMessage: MessageHandler?,
        onStateChange: StateHandler?,
        onError: ErrorHandler? = nil
    ) {
        queue.sync {
            self.onMessage = onMessage
            self.onStateChange = onStateChange
            self.onError = onError
        }
    }

    public func connect(to url: URL) {
        queue.async {
            self.url = url
            self.shouldStayConnected = true
            self.backoffSeconds = 1.5
            self.openConnection()
        }
    }

    public func disconnect() {
        queue.async {
            self.shouldStayConnected = false
            self.isOpening = false
            self.cancelLoops()
            self.closeTask()
            self.state = .disconnected
        }
    }

    public func send(text: String) throws {
        try queue.sync {
            guard let task, state == .connected else {
                throw WebSocketClientError.notConnected
            }
            task.send(.string(text)) { [weak self] error in
                if let error {
                    self?.reportError("send failed: \(error.localizedDescription)")
                }
            }
        }
    }

    public func sendJSON(_ object: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: object)
        guard let text = String(data: data, encoding: .utf8) else {
            throw WebSocketClientError.encodingFailed
        }
        try send(text: text)
    }

    // MARK: - Private

    private func openConnection() {
        guard shouldStayConnected, let url else { return }
        guard !isOpening else { return }
        isOpening = true
        cancelLoops()
        closeTask()
        hasEstablishedSession = false

        state = state == .disconnected ? .connecting : .reconnecting

        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        Self.applyOriginHeader(&request, webSocketURL: url)

        let wsTask = session.webSocketTask(with: request)
        task = wsTask
        wsTask.resume()

        // Web 版 ws.onopen と同等（Inbox / Signaling は接続時にサーバーから送られない）
        hasEstablishedSession = true
        isOpening = false
        state = .connected
        backoffSeconds = 1.5
        lastError = nil

        startReceiveLoop()
        startPingLoop()
    }

    private func markEstablished() {
        guard !hasEstablishedSession else { return }
        hasEstablishedSession = true
        isOpening = false
        state = .connected
        backoffSeconds = 1.5
        lastError = nil
        startPingLoop()
    }

    private func closeTask() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func cancelLoops() {
        receiveLoopTask?.cancel()
        receiveLoopTask = nil
        pingLoopTask?.cancel()
        pingLoopTask = nil
        reconnectTask?.cancel()
        reconnectTask = nil
    }

    private func scheduleReconnect(reason: String) {
        guard shouldStayConnected else { return }
        isOpening = false
        cancelLoops()
        closeTask()
        state = .reconnecting
        reportError(reason)

        let delay = backoffSeconds
        backoffSeconds = min(backoffSeconds * 1.5, maxBackoffSeconds)
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.queue.async {
                self?.openConnection()
            }
        }
    }

    private func reportError(_ message: String) {
        let urlText = url?.absoluteString ?? "(unknown url)"
        let full = "[\(label)] \(message) — \(urlText)"
        lastError = full
        #if DEBUG
        print("[LynkOS/WS] \(full)")
        #endif
        let handler = queue.sync { onError }
        if let handler {
            DispatchQueue.main.async {
                handler(full)
            }
        }
    }

    private func startReceiveLoop() {
        receiveLoopTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let currentTask: URLSessionWebSocketTask? = self.queue.sync { self.task }
                guard let currentTask else { break }
                do {
                    let message = try await currentTask.receive()
                    self.queue.async {
                        if !self.hasEstablishedSession {
                            self.markEstablished()
                        }
                    }
                    switch message {
                    case .string(let text):
                        let handler = self.queue.sync { self.onMessage }
                        handler?(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            let handler = self.queue.sync { self.onMessage }
                            handler?(text)
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    if Task.isCancelled { break }
                    self.queue.async {
                        if self.shouldStayConnected {
                            self.scheduleReconnect(reason: error.localizedDescription)
                        } else {
                            self.isOpening = false
                            self.state = .disconnected
                        }
                    }
                    break
                }
            }
        }
    }

    private func startPingLoop() {
        pingLoopTask?.cancel()
        pingLoopTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.pingIntervalSeconds * 1_000_000_000))
                if Task.isCancelled { break }
                do {
                    try self.sendJSON(["type": "ping"])
                } catch {
                    break
                }
            }
        }
    }

    private static func applyOriginHeader(_ request: inout URLRequest, webSocketURL: URL) {
        guard let host = webSocketURL.host else { return }
        let port = webSocketURL.port ?? (webSocketURL.scheme?.lowercased() == "wss" ? 443 : 80)
        let httpOrigin: String
        if (webSocketURL.scheme?.lowercased() == "wss") {
            httpOrigin = "https://\(host):\(port)"
        } else {
            httpOrigin = "http://\(host):\(port)"
        }
        request.setValue(httpOrigin, forHTTPHeaderField: "Origin")
    }
}
