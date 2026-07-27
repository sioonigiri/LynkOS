import SwiftUI

struct SupportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                aboutSection
                howToSection
                faqSection
                contactSection
                legalLinksSection
            }
            .padding(20)
        }
        .background(SupportAdaptiveTheme.background)
        .navigationTitle("サポート")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(SupportAdaptiveTheme.textMuted)
                }
            }
        }
    }

    private var aboutSection: some View {
        SupportSectionCard(title: SupportContent.aboutTitle) {
            Text(SupportContent.aboutBody)
                .font(.body)
                .foregroundStyle(SupportAdaptiveTheme.textSub)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var howToSection: some View {
        SupportSectionCard(title: SupportContent.howToTitle) {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(SupportContent.howToSteps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(SupportAdaptiveTheme.accent)
                            .frame(width: 24, height: 24)
                            .background(SupportAdaptiveTheme.accentSoft, in: Circle())

                        Text(step)
                            .font(.body)
                            .foregroundStyle(SupportAdaptiveTheme.textSub)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private var faqSection: some View {
        SupportSectionCard(title: SupportContent.faqTitle) {
            VStack(spacing: 0) {
                ForEach(Array(SupportContent.faqItems.enumerated()), id: \.element.id) { index, item in
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 8) {
                            if !item.answer.isEmpty {
                                Text(item.answer)
                                    .font(.subheadline)
                                    .foregroundStyle(SupportAdaptiveTheme.textSub)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            if !item.bullets.isEmpty {
                                VStack(alignment: .leading, spacing: 6) {
                                    ForEach(item.bullets, id: \.self) { bullet in
                                        HStack(alignment: .top, spacing: 8) {
                                            Text("•")
                                                .foregroundStyle(SupportAdaptiveTheme.accent)
                                            Text(bullet)
                                                .font(.subheadline)
                                                .foregroundStyle(SupportAdaptiveTheme.textSub)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                    } label: {
                        Text(item.question)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SupportAdaptiveTheme.text)
                            .multilineTextAlignment(.leading)
                    }
                    .tint(SupportAdaptiveTheme.accent)

                    if index < SupportContent.faqItems.count - 1 {
                        Divider()
                            .overlay(SupportAdaptiveTheme.border)
                            .padding(.vertical, 10)
                    }
                }
            }
        }
    }

    private var contactSection: some View {
        SupportSectionCard(title: SupportContent.contactTitle) {
            VStack(alignment: .leading, spacing: 12) {
                Text(SupportContent.contactLead)
                    .font(.body)
                    .foregroundStyle(SupportAdaptiveTheme.textSub)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    openURL(SupportContent.supportMailtoURL)
                } label: {
                    Text(SupportContent.supportEmail)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SupportAdaptiveTheme.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(SupportAdaptiveTheme.accentSoft, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var legalLinksSection: some View {
        SupportSectionCard(title: "法務") {
            VStack(spacing: 0) {
                legalNavigationLink(
                    title: SupportContent.privacyPolicy.title,
                    document: SupportContent.privacyPolicy
                )

                Divider()
                    .overlay(SupportAdaptiveTheme.border)
                    .padding(.vertical, 4)

                legalNavigationLink(
                    title: SupportContent.termsOfUse.title,
                    document: SupportContent.termsOfUse
                )
            }
        }
    }

    private func legalNavigationLink(title: String, document: SupportLegalDocument) -> some View {
        NavigationLink {
            SupportLegalDocumentView(document: document)
        } label: {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SupportAdaptiveTheme.text)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SupportAdaptiveTheme.textMuted)
            }
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}

private struct SupportSectionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(SupportAdaptiveTheme.textSub)
                .textCase(.uppercase)

            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SupportAdaptiveTheme.surface, in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(SupportAdaptiveTheme.border, lineWidth: 1)
        )
    }
}

#Preview {
    NavigationStack {
        SupportView()
    }
}
