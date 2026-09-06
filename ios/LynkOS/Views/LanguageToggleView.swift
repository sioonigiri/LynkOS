import LynkOSCore
import SwiftUI

/// 画面上部に置くシンプルな JP / EN 切り替えトグル。選択中の言語をピルでハイライトする。
struct LanguageToggleView: View {
    @ObservedObject private var loc = LocalizationManager.shared

    var body: some View {
        HStack(spacing: 2) {
            languageButton(.ja, title: "JP")
            languageButton(.en, title: "EN")
        }
        .padding(3)
        .background(LynkOSTheme.surface2, in: Capsule())
        .overlay(Capsule().stroke(LynkOSTheme.border, lineWidth: 1))
    }

    private func languageButton(_ language: AppLanguage, title: String) -> some View {
        let isSelected = loc.language == language
        return Button {
            LocalizationManager.shared.setLanguage(language)
        } label: {
            Text(title)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(isSelected ? .white : LynkOSTheme.textSub)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(isSelected ? LynkOSTheme.accent : Color.clear))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(language == .ja ? L(.languageSwitchToJapanese) : L(.languageSwitchToEnglish))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview {
    LanguageToggleView()
        .padding()
        .background(LynkOSTheme.background)
}
