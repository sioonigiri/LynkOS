import SwiftUI
import UIKit

/// サポート画面用のライト / ダーク両対応カラー（LynkOS の暖色系トーンを踏襲）。
enum SupportAdaptiveTheme {
    static let background = adaptive(
        light: UIColor(red: 0.96, green: 0.94, blue: 0.91, alpha: 1),
        dark: UIColor(red: 0.11, green: 0.10, blue: 0.09, alpha: 1)
    )
    static let surface = adaptive(
        light: UIColor(red: 0.99, green: 0.97, blue: 0.94, alpha: 1),
        dark: UIColor(red: 0.16, green: 0.15, blue: 0.14, alpha: 1)
    )
    static let surface2 = adaptive(
        light: UIColor(red: 0.93, green: 0.91, blue: 0.87, alpha: 1),
        dark: UIColor(red: 0.20, green: 0.19, blue: 0.17, alpha: 1)
    )
    static let border = adaptive(
        light: UIColor(red: 0.85, green: 0.82, blue: 0.75, alpha: 1),
        dark: UIColor(red: 0.32, green: 0.30, blue: 0.27, alpha: 1)
    )
    static let text = adaptive(
        light: UIColor(red: 0.24, green: 0.21, blue: 0.19, alpha: 1),
        dark: UIColor(red: 0.94, green: 0.92, blue: 0.89, alpha: 1)
    )
    static let textSub = adaptive(
        light: UIColor(red: 0.48, green: 0.44, blue: 0.39, alpha: 1),
        dark: UIColor(red: 0.76, green: 0.72, blue: 0.67, alpha: 1)
    )
    static let textMuted = adaptive(
        light: UIColor(red: 0.66, green: 0.62, blue: 0.57, alpha: 1),
        dark: UIColor(red: 0.58, green: 0.54, blue: 0.50, alpha: 1)
    )
    static let accent = adaptive(
        light: UIColor(red: 0.77, green: 0.58, blue: 0.42, alpha: 1),
        dark: UIColor(red: 0.85, green: 0.66, blue: 0.48, alpha: 1)
    )
    static let accentSoft = adaptive(
        light: UIColor(red: 0.96, green: 0.90, blue: 0.84, alpha: 1),
        dark: UIColor(red: 0.28, green: 0.22, blue: 0.17, alpha: 1)
    )

    private static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }
}
