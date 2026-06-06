import Foundation
import Network

/// Bonjour (`_lynkos._tcp`) による近傍 LynkOS 端末の探索。
/// メインアプリ側が NSNetService / NWListener で広告を開始すると Extension からも検出できる。
public final class BonjourDeviceDiscovery: @unchecked Sendable {
    public static let serviceType = "_lynkos._tcp"

    public struct DiscoveredDevice: Sendable, Equatable, Identifiable {
        public var id: String { endpointDescription }
        public let name: String
        public let endpointDescription: String
        public let txtDeviceId: String?
        public let txtPlatform: String?

        public init(
            name: String,
            endpointDescription: String,
            txtDeviceId: String? = nil,
            txtPlatform: String? = nil
        ) {
            self.name = name
            self.endpointDescription = endpointDescription
            self.txtDeviceId = txtDeviceId
            self.txtPlatform = txtPlatform
        }
    }

    public typealias UpdateHandler = @Sendable ([DiscoveredDevice]) -> Void

    private var browser: NWBrowser?
    private var onUpdate: UpdateHandler?
    private let queue = DispatchQueue(label: "com.lynkos.bonjour.browser")

    public init() {}

    public func start(onUpdate: @escaping UpdateHandler) {
        stop()
        self.onUpdate = onUpdate

        let params = NWParameters.tcp
        params.includePeerToPeer = true

        let browser = NWBrowser(
            for: .bonjour(type: Self.serviceType, domain: nil),
            using: params
        )
        self.browser = browser

        browser.stateUpdateHandler = { state in
            if case .failed = state {
                DispatchQueue.main.async { onUpdate([]) }
            }
        }

        browser.browseResultsChangedHandler = { [weak self] results, _ in
            self?.handleResults(results)
        }

        browser.start(queue: queue)
    }

    public func stop() {
        browser?.cancel()
        browser = nil
        onUpdate = nil
    }

    private func handleResults(_ results: Set<NWBrowser.Result>) {
        let devices = results.compactMap { result -> DiscoveredDevice? in
            guard case let .service(name, _, _, interface) = result.endpoint else {
                return nil
            }
            var txtDeviceId: String?
            var txtPlatform: String?
            switch result.metadata {
            case .bonjour(let record):
                let dict = record.dictionary
                txtDeviceId = dict["deviceId"]
                txtPlatform = dict["platform"]
            default:
                break
            }
            let endpointDesc = "\(name)@\(interface?.name ?? "local")"
            return DiscoveredDevice(
                name: name,
                endpointDescription: endpointDesc,
                txtDeviceId: txtDeviceId,
                txtPlatform: txtPlatform
            )
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        let handler = onUpdate
        DispatchQueue.main.async {
            handler?(devices)
        }
    }
}
