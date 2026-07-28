import Foundation
import LynkOSCore
import WebRTC

@MainActor
protocol WebRTCTransferSessionDelegate: AnyObject {
    func transferSession(_ session: WebRTCTransferSession, didUpdateProgress fileId: String, progress: Int, fileName: String)
    func transferSession(
        _ session: WebRTCTransferSession,
        didCompleteReceive fileName: String,
        savedURL: URL,
        mimeType: String,
        size: Int64
    )
    func transferSession(
        _ session: WebRTCTransferSession,
        didCompleteSend fileName: String,
        mimeType: String,
        size: Int64
    )
    func transferSession(_ session: WebRTCTransferSession, didFail message: String)
}

@MainActor
final class WebRTCTransferSession: NSObject {
    weak var delegate: WebRTCTransferSessionDelegate?

    private let factory: RTCPeerConnectionFactory
    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var signaling: WebSocketClient?
    private var myId: String = ""
    private var peerId: String = ""
    private var polite: Bool = false
    private var makingOffer = false
    private var ignoreOffer = false
    private var pendingCandidates: [Any] = []
    private var pendingOfferJSON: [String: Any]?

    private enum SessionMode {
        case receive
        case send(OutboundFilePayload)
    }

    private var sessionMode: SessionMode = .receive
    private var sendStarted = false
    private var currentSendId: String?
    private var fileRequestResponseContinuation: CheckedContinuation<Bool, Never>?
    private var fileAckContinuation: CheckedContinuation<Void, Error>?
    private var securityScopedURL: URL?
    private var securityAccessActive = false

    private static let chunkSize = 64 * 1024
    private static let bufferThreshold = 16 * chunkSize
    private static let fileAckTimeoutSeconds: UInt64 = 300
    private static let fileRequestResponseTimeoutSeconds: UInt64 = 120
    private static let peerDisconnectGraceNanoseconds: UInt64 = 550_000_000

    private var sessionEnded = false
    /// 転送成功後の相手側 teardown（シグナリング切断など）を失敗扱いにしない。
    private var sessionSucceeded = false
    private var peerDisconnectDebounceTask: Task<Void, Never>?
    private var fileRequestResponseTimeoutTask: Task<Void, Never>?
    private var receiveMeta: FileReceiveState?
    private var receiveFileHandle: FileHandle?
    private var receiveURL: URL?
    private var receivedSize: Int64 = 0

    private struct FileReceiveState {
        let id: String
        let name: String
        let size: Int64
        let mime: String
    }

    override init() {
        RTCInitializeSSL()
        factory = RTCPeerConnectionFactory()
        super.init()
    }

    func startReceive(config: ServerConfig, myId: String, peerId: String) {
        sessionMode = .receive
        beginSession(config: config, myId: myId, peerId: peerId)
    }

    func startSend(config: ServerConfig, myId: String, peerId: String, file: OutboundFilePayload) {
        sessionMode = .send(file)
        beginSession(config: config, myId: myId, peerId: peerId)
    }

    func disconnect() {
        sessionEnded = true
        tearDownConnection()
        sessionMode = .receive
    }

    // MARK: - Private

    private func tearDownConnection() {
        peerDisconnectDebounceTask?.cancel()
        peerDisconnectDebounceTask = nil
        fileRequestResponseTimeoutTask?.cancel()
        fileRequestResponseTimeoutTask = nil
        fileRequestResponseContinuation?.resume(returning: false)
        fileRequestResponseContinuation = nil
        fileAckContinuation?.resume(throwing: URLError(.cancelled))
        fileAckContinuation = nil
        if securityAccessActive, let securityScopedURL {
            securityScopedURL.stopAccessingSecurityScopedResource()
        }
        securityAccessActive = false
        securityScopedURL = nil
        sendStarted = false
        currentSendId = nil
        dataChannel?.close()
        dataChannel = nil
        peerConnection?.close()
        peerConnection = nil
        signaling?.disconnect()
        signaling = nil
        cleanupReceiveFile()
        pendingCandidates.removeAll()
        pendingOfferJSON = nil
        makingOffer = false
        ignoreOffer = false
    }

    private func beginSession(config: ServerConfig, myId: String, peerId: String) {
        let mode = sessionMode
        tearDownConnection()
        sessionMode = mode
        sessionEnded = false
        sessionSucceeded = false
        self.myId = myId
        self.peerId = peerId
        self.polite = myId > peerId

        if case .send(let payload) = sessionMode, let url = payload.sourceURL {
            securityScopedURL = url
            securityAccessActive = url.startAccessingSecurityScopedResource()
        }

        let room = SignalingClient.roomName(myId: myId, peerId: peerId)
        guard let url = config.signalingWebSocketURL(roomName: room) else {
            endSessionWithFailure("Invalid signaling URL")
            return
        }

        let pc = createPeerConnection()
        peerConnection = pc

        if !polite {
            let dcConfig = RTCDataChannelConfiguration()
            dcConfig.isOrdered = true
            if let channel = pc.dataChannel(forLabel: "file-transfer", configuration: dcConfig) {
                setupDataChannel(channel)
            }
        }

        let ws = WebSocketClient(label: "transfer-signaling")
        signaling = ws
        ws.setHandlers(
            onMessage: { [weak self] text in
                Task { @MainActor in
                    self?.handleSignalingMessage(text)
                }
            },
            onStateChange: { [weak self] state in
                Task { @MainActor in
                    guard let self, !self.sessionEnded, !self.sessionSucceeded else { return }
                    if state == .connected, !self.polite {
                        self.sendOfferIfNeeded()
                    } else if state == .disconnected || state == .reconnecting {
                        self.endSessionWithFailure("サーバーとの接続が切れました")
                    }
                }
            },
            onError: { [weak self] message in
                Task { @MainActor in
                    guard let self, !self.sessionEnded, !self.sessionSucceeded else { return }
                    self.endSessionWithFailure(message)
                }
            }
        )
        ws.connect(to: url)
    }

    private func createPeerConnection() -> RTCPeerConnection {
        let config = RTCConfiguration()
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"]),
        ]
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.iceCandidatePoolSize = 10

        let optional: [String: String] = [
            "OfferToReceiveAudio": "false",
            "OfferToReceiveVideo": "false",
        ]
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: optional)
        return factory.peerConnection(with: config, constraints: constraints, delegate: self)!
    }

    private func markSessionCompleted() {
        sessionSucceeded = true
        sessionEnded = true
        peerDisconnectDebounceTask?.cancel()
        peerDisconnectDebounceTask = nil
    }

    private func endSessionWithFailure(_ message: String) {
        guard !sessionEnded, !sessionSucceeded else { return }
        sessionEnded = true
        peerDisconnectDebounceTask?.cancel()
        peerDisconnectDebounceTask = nil
        tearDownConnection()
        delegate?.transferSession(self, didFail: message)
    }

    private func schedulePeerDisconnectFailure() {
        peerDisconnectDebounceTask?.cancel()
        peerDisconnectDebounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: Self.peerDisconnectGraceNanoseconds)
            guard !Task.isCancelled else { return }
            self?.endSessionWithFailure("相手が切断しました")
        }
    }

    private func isTransferInProgress() -> Bool {
        if sendStarted { return true }
        if receiveMeta != nil { return true }
        if dataChannel?.readyState == .open || dataChannel?.readyState == .connecting { return true }
        return false
    }

    private func setupDataChannel(_ channel: RTCDataChannel) {
        dataChannel = channel
        channel.delegate = self
    }

    private func handleSignalingMessage(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = msg["type"] as? String
        else { return }

        switch type {
        case "pong", "peer-joined":
            if type == "peer-joined", !polite, let pc = peerConnection {
                resendOfferIfNeeded(pc: pc)
            }
        case "peer-left", "disconnect":
            endSessionWithFailure("相手が切断しました")
        case "offer":
            Task { await applyRemoteOffer(msg) }
        case "answer":
            Task { await applyRemoteAnswer(msg) }
        case "ice-candidate":
            applyRemoteCandidate(msg)
        default:
            break
        }
    }

    private func resendOfferIfNeeded(pc: RTCPeerConnection) {
        guard !polite, pc.signalingState == .haveLocalOffer,
              let sdp = pc.localDescription else { return }
        sendSignaling(["type": "offer", "sdp": sdpToDict(sdp)])
    }

    private func sendSignaling(_ payload: [String: Any]) {
        try? signaling?.sendJSON(payload)
    }

    private func sdpToDict(_ sdp: RTCSessionDescription) -> [String: Any] {
        ["type": sdp.type == .offer ? "offer" : "answer", "sdp": sdp.sdp]
    }

    private func parseSDP(_ dict: [String: Any]) -> RTCSessionDescription? {
        guard let sdp = dict["sdp"] as? String else { return nil }
        let typeStr = (dict["type"] as? String) ?? "offer"
        let type: RTCSdpType = typeStr == "answer" ? .answer : .offer
        return RTCSessionDescription(type: type, sdp: sdp)
    }

    private func applyRemoteOffer(_ msg: [String: Any]) async {
        guard let pc = peerConnection else { return }
        guard let sdpDict = msg["sdp"] as? [String: Any],
              let remote = parseSDP(sdpDict) else { return }

        let collision = makingOffer || pc.signalingState != .stable
        ignoreOffer = !polite && collision
        if ignoreOffer { return }

        do {
            try await pc.setRemoteDescription(remote)
            await flushPendingCandidates()
            let answer = try await pc.answer(for: mediaConstraints())
            try await pc.setLocalDescription(answer)
            sendSignaling(["type": "answer", "sdp": sdpToDict(answer)])
            await flushPendingCandidates()
        } catch {
            endSessionWithFailure("Offer 処理失敗: \(error.localizedDescription)")
        }
    }

    private func applyRemoteAnswer(_ msg: [String: Any]) async {
        guard let pc = peerConnection, pc.signalingState == .haveLocalOffer,
              let sdpDict = msg["sdp"] as? [String: Any],
              let remote = parseSDP(sdpDict) else { return }
        do {
            try await pc.setRemoteDescription(remote)
            await flushPendingCandidates()
        } catch {
            endSessionWithFailure("Answer 処理失敗: \(error.localizedDescription)")
        }
    }

    private func applyRemoteCandidate(_ msg: [String: Any]) {
        guard let pc = peerConnection else { return }
        guard msg.keys.contains("candidate") else { return }

        if pc.remoteDescription == nil {
            pendingCandidates.append(msg["candidate"] as Any)
            return
        }

        guard let candidate = iceCandidate(from: msg["candidate"]) else { return }
        pc.add(candidate) { _ in }
    }

    private func flushPendingCandidates() async {
        guard let pc = peerConnection else { return }
        let queued = pendingCandidates
        pendingCandidates.removeAll()
        for item in queued {
            if item is NSNull { continue }
            guard let candidate = iceCandidate(from: item) else { continue }
            await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
                pc.add(candidate) { _ in cont.resume() }
            }
        }
    }

    private func iceCandidate(from value: Any?) -> RTCIceCandidate? {
        if value is NSNull || value == nil { return nil }
        guard let dict = value as? [String: Any],
              let sdp = dict["candidate"] as? String else { return nil }
        let mid = dict["sdpMid"] as? String
        let index = dict["sdpMLineIndex"] as? Int32 ?? Int32(dict["sdpMLineIndex"] as? Int ?? 0)
        return RTCIceCandidate(sdp: sdp, sdpMLineIndex: index, sdpMid: mid)
    }

    private func mediaConstraints() -> RTCMediaConstraints {
        RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["OfferToReceiveAudio": "false", "OfferToReceiveVideo": "false"]
        )
    }

    private func sendOfferIfNeeded() {
        guard !polite, let pc = peerConnection, !makingOffer, pc.signalingState == .stable else { return }
        makingOffer = true
        Task {
            defer { makingOffer = false }
            do {
                let offer = try await pc.offer(for: mediaConstraints())
                try await pc.setLocalDescription(offer)
                sendSignaling(["type": "offer", "sdp": sdpToDict(offer)])
            } catch {
                endSessionWithFailure("Offer 作成失敗")
            }
        }
    }

    private func handleDataChannelMessage(_ buffer: RTCDataBuffer) {
        let payload = buffer.data as Data
        if buffer.isBinary {
            handleBinaryChunk(payload)
            return
        }
        guard let text = String(data: payload, encoding: .utf8),
              let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }

        switch type {
        case "file-request-response":
            fileRequestResponseTimeoutTask?.cancel()
            fileRequestResponseTimeoutTask = nil
            if let accepted = json["accepted"] as? Bool {
                fileRequestResponseContinuation?.resume(returning: accepted)
                fileRequestResponseContinuation = nil
            }
        case "file-received-ack":
            if let id = json["id"] as? String, id == currentSendId {
                markSessionCompleted()
                fileAckContinuation?.resume()
                fileAckContinuation = nil
            }
        case "file-request":
            guard case .receive = sessionMode else { return }
            let accepted = json["signalingPreApproved"] as? Bool ?? false
            sendDataJSON(["type": "file-request-response", "accepted": accepted])
        case "file-meta":
            guard case .receive = sessionMode else { return }
            beginReceiveFile(json)
        case "file-end":
            guard case .receive = sessionMode else { return }
            finishReceiveFile(json)
        default:
            break
        }
    }

    private func onDataChannelReady() {
        guard dataChannel?.readyState == .open else { return }
        if case .send = sessionMode {
            Task { await sendOutboundFileIfNeeded() }
        }
    }

    private func sendOutboundFileIfNeeded() async {
        guard !sendStarted else { return }
        guard case .send(let file) = sessionMode else { return }
        guard let channel = dataChannel, channel.readyState == .open else { return }
        sendStarted = true
        currentSendId = file.id

        let request: [String: Any] = [
            "type": "file-request",
            "signalingPreApproved": true,
            "files": [[
                "name": file.name,
                "size": file.size,
                "type": file.mimeType,
            ]],
        ]
        sendDataJSON(request)

        let accepted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            fileRequestResponseContinuation = cont
            fileRequestResponseTimeoutTask?.cancel()
            fileRequestResponseTimeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: Self.fileRequestResponseTimeoutSeconds * 1_000_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard let self, self.fileRequestResponseContinuation != nil else { return }
                    self.fileRequestResponseContinuation?.resume(returning: false)
                    self.fileRequestResponseContinuation = nil
                    self.endSessionWithFailure("相手からの応答がありませんでした")
                }
            }
        }
        fileRequestResponseTimeoutTask?.cancel()
        fileRequestResponseTimeoutTask = nil
        guard !sessionEnded else { return }
        guard accepted else {
            endSessionWithFailure("相手が転送を拒否しました")
            return
        }

        do {
            try await sendFileChunks(file)
            if !sessionSucceeded {
                markSessionCompleted()
            }
            delegate?.transferSession(
                self,
                didCompleteSend: file.name,
                mimeType: file.mimeType,
                size: file.size
            )
        } catch {
            endSessionWithFailure(error.localizedDescription)
        }
    }

    private func ensureSendTransportReady() throws {
        guard !sessionEnded else {
            throw URLError(.networkConnectionLost)
        }
        guard let channel = dataChannel, channel.readyState == .open else {
            throw URLError(.networkConnectionLost)
        }
        guard let pc = peerConnection else {
            throw URLError(.networkConnectionLost)
        }
        let pcState = pc.connectionState
        guard pcState == .connected || pcState == .connecting else {
            throw URLError(.networkConnectionLost)
        }
        let ice = pc.iceConnectionState
        guard ice != .failed, ice != .closed else {
            throw URLError(.networkConnectionLost)
        }
    }

    private func sendFileChunks(_ file: OutboundFilePayload) async throws {
        try ensureSendTransportReady()
        guard let channel = dataChannel else {
            throw URLError(.networkConnectionLost)
        }

        sendDataJSON([
            "type": "file-meta",
            "id": file.id,
            "name": file.name,
            "size": file.size,
            "mime": file.mimeType,
        ])
        delegate?.transferSession(self, didUpdateProgress: file.id, progress: 0, fileName: file.name)

        let totalSize = file.size
        var offset: Int64 = 0

        if let data = file.sourceData {
            while offset < totalSize {
                try ensureSendTransportReady()
                await waitForChannelDrain(channel)
                let length = Int(min(Int64(Self.chunkSize), totalSize - offset))
                let start = Int(offset)
                let end = min(start + length, data.count)
                let chunk = data.subdata(in: start ..< end)
                let buffer = RTCDataBuffer(data: chunk, isBinary: true)
                guard channel.sendData(buffer) else {
                    throw URLError(.cannotWriteToFile)
                }
                offset += Int64(length)
                reportSendProgress(file: file, offset: offset, totalSize: totalSize)
            }
        } else if let url = file.sourceURL {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            while offset < totalSize {
                try ensureSendTransportReady()
                await waitForChannelDrain(channel)
                let length = Int(min(Int64(Self.chunkSize), totalSize - offset))
                try handle.seek(toOffset: UInt64(offset))
                let chunk = handle.readData(ofLength: length)
                let buffer = RTCDataBuffer(data: chunk, isBinary: true)
                guard channel.sendData(buffer) else {
                    throw URLError(.cannotWriteToFile)
                }
                offset += Int64(chunk.count)
                reportSendProgress(file: file, offset: offset, totalSize: totalSize)
            }
        } else {
            throw URLError(.fileDoesNotExist)
        }

        sendDataJSON(["type": "file-end", "id": file.id])
        delegate?.transferSession(self, didUpdateProgress: file.id, progress: 100, fileName: file.name)

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            fileAckContinuation = cont
            Task {
                try? await Task.sleep(nanoseconds: Self.fileAckTimeoutSeconds * 1_000_000_000)
                if fileAckContinuation != nil {
                    fileAckContinuation?.resume(throwing: URLError(.timedOut))
                    fileAckContinuation = nil
                }
            }
        }
    }

    private func reportSendProgress(file: OutboundFilePayload, offset: Int64, totalSize: Int64) {
        guard totalSize > 0 else { return }
        let pct = min(99, Int((Double(offset) / Double(totalSize)) * 100))
        delegate?.transferSession(self, didUpdateProgress: file.id, progress: pct, fileName: file.name)
    }

    private func waitForChannelDrain(_ channel: RTCDataChannel) async {
        while channel.bufferedAmount > Self.bufferThreshold {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    private func beginReceiveFile(_ json: [String: Any]) {
        cleanupReceiveFile()
        guard
            let id = json["id"] as? String,
            let name = json["name"] as? String
        else { return }
        let size: Int64
        if let n = json["size"] as? NSNumber { size = n.int64Value }
        else if let n = json["size"] as? Int { size = Int64(n) }
        else { size = 0 }
        let mime = json["mime"] as? String ?? "application/octet-stream"
        receiveMeta = FileReceiveState(id: id, name: name, size: size, mime: mime)
        receivedSize = 0

        let dest = ReceivedFileStorage.makePendingReceiveURL(receiveId: id, fileName: name)
        let created = FileManager.default.createFile(atPath: dest.path, contents: nil)
        if !created {
            try? Data().write(to: dest)
        }
        guard let handle = try? FileHandle(forWritingTo: dest) else {
            ReceivedFileStorage.deletePendingReceiveFile(at: dest)
            delegate?.transferSession(self, didFail: "受信ファイルを作成できませんでした")
            return
        }
        receiveURL = dest
        receiveFileHandle = handle
        delegate?.transferSession(self, didUpdateProgress: id, progress: 0, fileName: name)
    }

    private func handleBinaryChunk(_ data: Data) {
        guard receiveMeta != nil, let handle = receiveFileHandle else { return }
        do {
            try handle.write(contentsOf: data)
        } catch {
            return
        }
        receivedSize += Int64(data.count)
        if let meta = receiveMeta, meta.size > 0 {
            let pct = min(99, Int((Double(receivedSize) / Double(meta.size)) * 100))
            delegate?.transferSession(self, didUpdateProgress: meta.id, progress: pct, fileName: meta.name)
        }
    }

    private func finishReceiveFile(_ json: [String: Any]) {
        guard let meta = receiveMeta, let url = receiveURL else { return }
        try? receiveFileHandle?.close()
        receiveFileHandle = nil
        // disconnect() → cleanupReceiveFile() が受信済みファイルを消さないよう、
        // didCompleteReceive（内部で finishReceiveFlow/disconnect）より先に受信状態をクリアする。
        receiveMeta = nil
        receiveURL = nil
        let finalReceivedSize = receivedSize
        receivedSize = 0

        sendDataJSON(["type": "file-received-ack", "id": meta.id])
        delegate?.transferSession(self, didUpdateProgress: meta.id, progress: 100, fileName: meta.name)

        guard let handoffURL = ReceivedFileStorage.prepareReceivedFileForHandoff(at: url) else {
            ReceivedFileStorage.deletePendingReceiveFile(at: url)
            delegate?.transferSession(self, didFail: "受信ファイルの保存に失敗しました")
            return
        }

        let reportedSize = meta.size > 0 ? meta.size : finalReceivedSize
        markSessionCompleted()
        delegate?.transferSession(
            self,
            didCompleteReceive: meta.name,
            savedURL: handoffURL,
            mimeType: meta.mime,
            size: reportedSize
        )
    }

    /// 受信中のみ一時ファイルを削除する（完了後は AppViewModel 側で削除）。
    private func cleanupReceiveFile() {
        try? receiveFileHandle?.close()
        receiveFileHandle = nil
        if receiveMeta != nil, let url = receiveURL {
            ReceivedFileStorage.deletePendingReceiveFile(at: url)
        }
        receiveMeta = nil
        receiveURL = nil
        receivedSize = 0
    }


    private func sendDataJSON(_ object: [String: Any]) {
        guard let channel = dataChannel, channel.readyState == .open,
              let data = try? JSONSerialization.data(withJSONObject: object) else { return }
        let buffer = RTCDataBuffer(data: data, isBinary: false)
        channel.sendData(buffer)
    }
}

extension WebRTCTransferSession: RTCPeerConnectionDelegate {
    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    nonisolated func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        Task { @MainActor in
            guard !sessionEnded, !sessionSucceeded, self.peerConnection === peerConnection else { return }
            switch newState {
            case .failed:
                endSessionWithFailure("接続が切断されました")
            case .disconnected:
                if isTransferInProgress() {
                    schedulePeerDisconnectFailure()
                }
            case .connected, .completed:
                peerDisconnectDebounceTask?.cancel()
            default:
                break
            }
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let payload: [String: Any] = [
            "type": "ice-candidate",
            "candidate": [
                "candidate": candidate.sdp,
                "sdpMid": candidate.sdpMid ?? "",
                "sdpMLineIndex": candidate.sdpMLineIndex,
            ] as [String: Any],
        ]
        Task { @MainActor in
            self.sendSignaling(payload)
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        Task { @MainActor in
            self.setupDataChannel(dataChannel)
            self.onDataChannelReady()
        }
    }

    nonisolated func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        Task { @MainActor in
            guard !sessionEnded, !sessionSucceeded, self.peerConnection === peerConnection else { return }
            switch newState {
            case .failed, .closed:
                endSessionWithFailure("接続が切断されました")
            case .disconnected:
                if isTransferInProgress() {
                    schedulePeerDisconnectFailure()
                }
            case .connected:
                peerDisconnectDebounceTask?.cancel()
            default:
                break
            }
        }
    }
}

extension WebRTCTransferSession: RTCDataChannelDelegate {
    nonisolated func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        Task { @MainActor in
            if dataChannel.readyState == .open {
                if !self.polite {
                    self.sendOfferIfNeeded()
                }
                self.onDataChannelReady()
            } else if dataChannel.readyState == .closed || dataChannel.readyState == .closing {
                if !self.sessionEnded, !self.sessionSucceeded, self.isTransferInProgress() {
                    self.endSessionWithFailure("相手が切断しました")
                }
            }
        }
    }

    nonisolated func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        Task { @MainActor in
            self.handleDataChannelMessage(buffer)
        }
    }
}

private extension RTCPeerConnection {
    func offer(for constraints: RTCMediaConstraints) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { cont in
            offer(for: constraints) { sdp, error in
                if let error { cont.resume(throwing: error) }
                else if let sdp { cont.resume(returning: sdp) }
                else { cont.resume(throwing: URLError(.unknown)) }
            }
        }
    }

    func answer(for constraints: RTCMediaConstraints) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation { cont in
            answer(for: constraints) { sdp, error in
                if let error { cont.resume(throwing: error) }
                else if let sdp { cont.resume(returning: sdp) }
                else { cont.resume(throwing: URLError(.unknown)) }
            }
        }
    }

    func setLocalDescription(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            setLocalDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }

    func setRemoteDescription(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            setRemoteDescription(sdp) { error in
                if let error { cont.resume(throwing: error) }
                else { cont.resume() }
            }
        }
    }
}
