import Foundation

/// 同一 LAN 上で `_lynkos._tcp` として端末を広告する（メイン iOS アプリ用）。
/// 接続受付は不要なため `NetService` で publish のみ行う（`NWListener` は connection handler 必須）。
public final class BonjourDeviceAdvertiser: @unchecked Sendable {
    /// NetService の type は末尾に `.` が必要。
    private static let netServiceType = BonjourDeviceDiscovery.serviceType + "."

    private var netService: NetService?
    private var publishDelegate: PublishDelegate?

    public init() {}

    public func start(device: DeviceInfo) {
        DispatchQueue.main.async {
            self.startOnMainThread(device: device)
        }
    }

    public func stop() {
        DispatchQueue.main.async {
            self.stopOnMainThread()
        }
    }

    // MARK: - Private

    private func startOnMainThread(device: DeviceInfo) {
        stopOnMainThread()

        let name = Self.sanitizeServiceName(device.name)
        let service = NetService(
            domain: "local.",
            type: Self.netServiceType,
            name: name,
            port: 0
        )
        service.includesPeerToPeer = true

        if let txt = Self.makeTXTRecord(device: device) {
            service.setTXTRecord(txt)
        }

        let delegate = PublishDelegate(serviceName: name)
        service.delegate = delegate
        publishDelegate = delegate

        service.schedule(in: .main, forMode: .common)
        service.publish()

        netService = service
    }

    private func stopOnMainThread() {
        guard let service = netService else { return }
        service.stop()
        service.remove(from: .main, forMode: .common)
        service.delegate = nil
        netService = nil
        publishDelegate = nil
    }

    private static func makeTXTRecord(device: DeviceInfo) -> Data? {
        let dict: [String: Data] = [
            "deviceId": Data(device.deviceId.utf8),
            "platform": Data(device.platform.utf8),
            "type": Data(device.type.utf8),
        ]
        return NetService.data(fromTXTRecord: dict)
    }

    /// Bonjour サービス名（表示名）のサニタイズ。最大 63 バイト目安。
    private static func sanitizeServiceName(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = trimmed.isEmpty ? "LynkOS" : trimmed
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-"))
        var filtered = String(base.unicodeScalars.filter { allowed.contains($0) })
        if filtered.isEmpty { filtered = "LynkOS" }
        if filtered.count > 63 {
            filtered = String(filtered.prefix(63))
        }
        return filtered
    }
}

// MARK: - NetServiceDelegate

private final class PublishDelegate: NSObject, NetServiceDelegate {
    private let serviceName: String

    init(serviceName: String) {
        self.serviceName = serviceName
    }

    func netServiceDidPublish(_ sender: NetService) {
        #if DEBUG
        print("[LynkOS/Bonjour] advertise published: \(serviceName)")
        #endif
    }

    func netService(_ sender: NetService, didNotPublish errorDict: [String: NSNumber]) {
        #if DEBUG
        print("[LynkOS/Bonjour] advertise failed: \(errorDict)")
        #endif
    }

    func netServiceDidStop(_ sender: NetService) {
        #if DEBUG
        print("[LynkOS/Bonjour] advertise stopped: \(serviceName)")
        #endif
    }
}
