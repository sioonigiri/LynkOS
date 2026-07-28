import Foundation

public enum DeviceRegistrationError: Error, LocalizedError {
    case invalidURL
    case httpStatus(Int)
    case transport(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            "Invalid server URL"
        case .httpStatus(let code):
            "HTTP \(code)"
        case .transport(let error):
            error.localizedDescription
        }
    }
}

/// POST /api/devices/ による端末登録・TTL 更新。
public struct DeviceRegistrationService: Sendable {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func register(device: DeviceInfo, config: ServerConfig) async throws {
        guard let url = config.apiDevicesURL else {
            throw DeviceRegistrationError.invalidURL
        }
        var payload: [String: Any] = [
            "deviceId": device.deviceId,
            "name": device.name,
            "type": device.type,
            "platform": device.platform,
        ]
        if let icon = device.icon, !icon.isEmpty {
            payload["icon"] = icon
        }
        let body = try JSONSerialization.data(withJSONObject: payload)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 45
        do {
            let (_, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw DeviceRegistrationError.httpStatus(-1)
            }
            guard (200 ..< 300).contains(http.statusCode) else {
                throw DeviceRegistrationError.httpStatus(http.statusCode)
            }
        } catch let error as DeviceRegistrationError {
            throw error
        } catch {
            throw DeviceRegistrationError.transport(error)
        }
    }

    public func fetchDevices(config: ServerConfig) async throws -> [RemoteDevice] {
        guard let url = config.apiDevicesURL else {
            throw DeviceRegistrationError.invalidURL
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 45
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw DeviceRegistrationError.httpStatus(-1)
            }
            guard (200 ..< 300).contains(http.statusCode) else {
                throw DeviceRegistrationError.httpStatus(http.statusCode)
            }
            let decoder = JSONDecoder()
            return try decoder.decode([RemoteDevice].self, from: data)
        } catch let error as DeviceRegistrationError {
            throw error
        } catch {
            throw DeviceRegistrationError.transport(error)
        }
    }

    public func unregister(deviceId: String, config: ServerConfig) async {
        guard let url = config.apiDevicesURL else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["deviceId": deviceId])
        _ = try? await session.data(for: request)
    }
}
