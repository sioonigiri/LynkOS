import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// 同一 LAN 上の LynkOS シグナリングサーバー（Django）を `_lynkos-hub._tcp` で探索する。
/// `NetService` で resolve し TXT `origin`（または host:port）から URL を得る。
public final class BonjourHubDiscovery: NSObject, @unchecked Sendable {
    public static let serviceType = "_lynkos-hub._tcp."

    public struct DiscoveredHub: Sendable, Equatable, Identifiable {
        public var id: String { httpOrigin }
        public let name: String
        public let httpOrigin: String

        public init(name: String, httpOrigin: String) {
            self.name = name
            self.httpOrigin = httpOrigin
        }
    }

    public typealias UpdateHandler = @Sendable ([DiscoveredHub]) -> Void

    private let browser = NetServiceBrowser()
    private var onUpdate: UpdateHandler?
    private var resolvingServices: [NetService] = []
    private var hubsByOrigin: [String: DiscoveredHub] = [:]
    private let syncQueue = DispatchQueue(label: "com.lynkos.hub.discovery")

    public override init() {
        super.init()
        browser.includesPeerToPeer = true
    }

    public func start(onUpdate: @escaping UpdateHandler) {
        stop()
        self.onUpdate = onUpdate
        browser.delegate = self
        browser.schedule(in: .main, forMode: .common)
        browser.searchForServices(ofType: Self.serviceType, inDomain: "")
    }

    public func stop() {
        browser.stop()
        browser.delegate = nil
        browser.remove(from: .main, forMode: .common)
        for service in resolvingServices {
            service.stop()
            service.remove(from: .main, forMode: .common)
            service.delegate = nil
        }
        resolvingServices.removeAll()
        hubsByOrigin.removeAll()
        onUpdate = nil
    }

    /// 最初に見つかった Hub を返す（Extension 起動時のワンショット探索用）。
    public static func discoverFirstHub(timeout: TimeInterval = 5) async -> DiscoveredHub? {
        await withCheckedContinuation { continuation in
            let discovery = BonjourHubDiscovery()
            let lock = NSLock()
            var finished = false

            func finish(_ hub: DiscoveredHub?) {
                lock.lock()
                defer { lock.unlock() }
                guard !finished else { return }
                finished = true
                discovery.stop()
                continuation.resume(returning: hub)
            }

            discovery.start { hubs in
                if let first = hubs.first {
                    finish(first)
                }
            }

            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                finish(nil)
            }
        }
    }

    // MARK: - Private

    private func publishSortedHubs() {
        let sorted = hubsByOrigin.values.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
        let handler = onUpdate
        DispatchQueue.main.async {
            handler?(sorted)
        }
    }

    private func storeHub(name: String, origin: String) {
        guard let normalized = Self.normalizedHubOrigin(origin) else { return }
        hubsByOrigin[normalized] = DiscoveredHub(name: name, httpOrigin: normalized)
        publishSortedHubs()
    }

    private static func normalizedHubOrigin(_ raw: String) -> String? {
        let value = ServerConfig.normalizeHTTPOrigin(raw)
        let config = ServerConfig(httpOrigin: value, treatEmptyAsUnconfigured: true)
        guard config.isConfigured, !config.isLoopback else {
            return nil
        }
        return config.httpOrigin
    }

    private static func originFromResolvedService(_ service: NetService) -> String? {
        if let txt = service.txtRecordData() {
            let dict = NetService.dictionary(fromTXTRecord: txt)
            if let data = dict["origin"],
               let origin = String(data: data, encoding: .utf8),
               let normalized = normalizedHubOrigin(origin) {
                return normalized
            }
        }
        if let ip = ipv4Address(from: service), service.port > 0 {
            return normalizedHubOrigin("http://\(ip):\(service.port)")
        }
        guard let host = service.hostName, service.port > 0 else {
            return nil
        }
        let hostOnly = host.hasSuffix(".") ? String(host.dropLast()) : host
        let stripped = hostOnly.hasSuffix(".local")
            ? String(hostOnly.dropLast(".local".count))
            : hostOnly
        guard !stripped.isEmpty else { return nil }
        return normalizedHubOrigin("http://\(stripped):\(service.port)")
    }

    private static func ipv4Address(from service: NetService) -> String? {
        guard let addresses = service.addresses else { return nil }
        for data in addresses {
            guard data.count >= MemoryLayout<sockaddr>.size else { continue }
            let ip = data.withUnsafeBytes { raw -> String? in
                guard let base = raw.baseAddress?.assumingMemoryBound(to: sockaddr.self) else {
                    return nil
                }
                if base.pointee.sa_family == UInt8(AF_INET) {
                    var addr = base.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
                    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                    guard inet_ntop(AF_INET, &addr.sin_addr, &buffer, socklen_t(INET_ADDRSTRLEN)) != nil else {
                        return nil
                    }
                    return String(cString: buffer)
                }
                return nil
            }
            if let ip, !ip.hasPrefix("127.") {
                return ip
            }
        }
        return nil
    }
}

// MARK: - NetServiceBrowserDelegate

extension BonjourHubDiscovery: NetServiceBrowserDelegate {
    public func netServiceBrowser(
        _ browser: NetServiceBrowser,
        didFind service: NetService,
        moreComing: Bool
    ) {
        service.delegate = self
        service.includesPeerToPeer = true
        syncQueue.sync {
            resolvingServices.append(service)
        }
        service.schedule(in: .main, forMode: .common)
        service.resolve(withTimeout: 8)
    }

    public func netServiceBrowser(
        _ browser: NetServiceBrowser,
        didRemove service: NetService,
        moreComing: Bool
    ) {
        syncQueue.sync {
            resolvingServices.removeAll { $0 === service }
            if let origin = Self.originFromResolvedService(service) {
                hubsByOrigin.removeValue(forKey: origin)
            }
        }
        service.stop()
        service.remove(from: .main, forMode: .common)
        publishSortedHubs()
    }

    public func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
        publishSortedHubs()
    }
}

// MARK: - NetServiceDelegate

extension BonjourHubDiscovery: NetServiceDelegate {
    public func netServiceDidResolveAddress(_ sender: NetService) {
        guard let origin = Self.originFromResolvedService(sender) else { return }
        storeHub(name: sender.name, origin: origin)
    }

    public func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        syncQueue.sync {
            resolvingServices.removeAll { $0 === sender }
        }
    }
}
