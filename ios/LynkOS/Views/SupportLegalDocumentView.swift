import SwiftUI

struct SupportLegalDocumentView: View {
    let document: SupportLegalDocument

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ForEach(document.sections) { section in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(section.title)
                            .font(.headline)
                            .foregroundStyle(SupportAdaptiveTheme.text)

                        ForEach(section.paragraphs, id: \.self) { paragraph in
                            Text(paragraph)
                                .font(.body)
                                .foregroundStyle(SupportAdaptiveTheme.textSub)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        if !section.bullets.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(section.bullets, id: \.self) { bullet in
                                    HStack(alignment: .top, spacing: 8) {
                                        Text("•")
                                            .foregroundStyle(SupportAdaptiveTheme.accent)
                                        Text(bullet)
                                            .font(.body)
                                            .foregroundStyle(SupportAdaptiveTheme.textSub)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SupportAdaptiveTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(SupportAdaptiveTheme.border, lineWidth: 1)
                    )
                }
            }
            .padding(20)
        }
        .background(SupportAdaptiveTheme.background)
        .navigationTitle(document.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        SupportLegalDocumentView(document: SupportContent.privacyPolicy)
    }
}
