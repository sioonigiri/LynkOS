import Foundation
import Security

public enum DeviceIdentityError: Error, LocalizedError {
    case keychainFailure(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .keychainFailure(let status):
            "Keychain error (\(status))"
        }
    }
}

/// deviceId を Keychain に永続化する。
public enum DeviceIdentity {
    private static let service = "com.lynkos.app.device"
    private static let account = "deviceId"

    public static func loadOrCreateDeviceId() throws -> String {
        if let existing = try loadDeviceId() {
            return existing
        }
        let id = "ios-\(UUID().uuidString.lowercased())"
        try saveDeviceId(id)
        return id
    }

    public static func loadDeviceId() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw DeviceIdentityError.keychainFailure(status)
        }
        guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        return value
    }

    public static func saveDeviceId(_ deviceId: String) throws {
        let data = Data(deviceId.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        if updateStatus == errSecItemNotFound {
            var addQuery = query
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw DeviceIdentityError.keychainFailure(addStatus)
            }
            return
        }
        throw DeviceIdentityError.keychainFailure(updateStatus)
    }
}
