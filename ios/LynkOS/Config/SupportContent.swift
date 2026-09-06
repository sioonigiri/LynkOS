import Foundation
import LynkOSCore

/// サポート画面の文言・FAQ・法務文書。項目追加はこのファイルを編集する。
///
/// JP/EN それぞれの文言は `ja` / `en` に同じ形で並べてあるので、
/// 韓国語・中国語などを追加する場合は同じ形の enum を増やし、
/// 下の各 `static var` の分岐に case を足すだけでよい。
@MainActor
enum SupportContent {
    nonisolated static let supportEmail = "bread.morn1296@gmail.com"

    static var supportMailtoURL: URL {
        URL(string: "mailto:\(supportEmail)")!
    }

    private static var language: AppLanguage {
        LocalizationManager.shared.language
    }

    static var aboutTitle: String {
        language == .ja ? ja.aboutTitle : en.aboutTitle
    }

    static var aboutBody: String {
        language == .ja ? ja.aboutBody : en.aboutBody
    }

    static var howToTitle: String {
        language == .ja ? ja.howToTitle : en.howToTitle
    }

    static var howToSteps: [String] {
        language == .ja ? ja.howToSteps : en.howToSteps
    }

    static var faqTitle: String {
        language == .ja ? ja.faqTitle : en.faqTitle
    }

    static var faqItems: [SupportFAQItem] {
        language == .ja ? ja.faqItems : en.faqItems
    }

    static var contactTitle: String {
        language == .ja ? ja.contactTitle : en.contactTitle
    }

    static var contactLead: String {
        language == .ja ? ja.contactLead : en.contactLead
    }

    static var privacyPolicy: SupportLegalDocument {
        language == .ja ? ja.privacyPolicy : en.privacyPolicy
    }

    static var termsOfUse: SupportLegalDocument {
        language == .ja ? ja.termsOfUse : en.termsOfUse
    }

    // MARK: - 日本語版（基準）

    private enum ja {
        static let aboutTitle = "LynkOSについて"
        static let aboutBody =
            "同じ Wi-Fi 上の端末間で、写真・動画・書類などを送受信できるアプリです。"

        static let howToTitle = "使い方"
        static let howToSteps: [String] = [
            "両方の端末を同じ Wi-Fi に接続する",
            "LynkOS を起動する",
            "ファイルを選び、送信先をタップする",
            "受信側で「許可」をタップする",
        ]

        static let faqTitle = "よくある質問"
        static let faqItems: [SupportFAQItem] = [
            SupportFAQItem(
                id: "device-not-found",
                question: "相手の端末が見つからない",
                answer: "",
                bullets: [
                    "同じ Wi-Fi に接続されているか",
                    "受信側でも LynkOS が起動しているか",
                    "画面を下に引っ張って更新する",
                ]
            ),
            SupportFAQItem(
                id: "offline",
                question: "「オフライン」と表示される",
                answer: "",
                bullets: [
                    "Wi-Fi を確認し、アプリを再起動する",
                    "初回は接続に 30 秒ほどかかることがある",
                    "VPN をオフにして試す",
                ]
            ),
            SupportFAQItem(
                id: "cannot-send",
                question: "ファイルを送信できない",
                answer: "",
                bullets: [
                    "送信先が一覧に出ているか",
                    "相手が許可ダイアログを確認しているか",
                    "転送中でないか",
                ]
            ),
        ]

        static let contactTitle = "お問い合わせ"
        static let contactLead = "不具合・ご要望はメールでどうぞ。"

        static let privacyPolicy = SupportLegalDocument(
            id: "privacy",
            title: "プライバシーポリシー",
            sections: [
                SupportLegalSection(
                    title: "基本方針",
                    paragraphs: [
                        "LynkOS は、転送に必要な範囲の端末・ネットワーク情報のみを利用します。ファイル内容の収集・保存・販売は行いません。",
                    ]
                ),
                SupportLegalSection(
                    title: "利用目的",
                    paragraphs: [],
                    bullets: [
                        "ファイル転送・端末検出・通信の確立",
                        "品質改善・不具合対応",
                    ]
                ),
                SupportLegalSection(
                    title: "その他",
                    paragraphs: [
                        "法令に基づく場合を除き、第三者へ情報を提供しません。",
                        "お問い合わせ: \(supportEmail)",
                        "本ポリシーは変更される場合があります。",
                    ]
                ),
            ]
        )

        static let termsOfUse = SupportLegalDocument(
            id: "terms",
            title: "利用規約",
            sections: [
                SupportLegalSection(
                    title: "同意",
                    paragraphs: [
                        "本アプリの利用により、本規約に同意したものとみなします。",
                    ]
                ),
                SupportLegalSection(
                    title: "利用条件",
                    paragraphs: [],
                    bullets: [
                        "同一ネットワーク上の端末間でファイルを送受信できます",
                        "転送前に受信者の許可が必要です",
                        "送信内容の責任は利用者にあります",
                        "権利侵害・違法な利用は禁止します",
                    ]
                ),
                SupportLegalSection(
                    title: "免責・変更",
                    paragraphs: [
                        "通信環境により転送が失敗する場合があります。開発者は法令の範囲内で責任を負います。",
                        "サービス内容は予告なく変更・停止される場合があります。",
                        "お問い合わせ: \(supportEmail)",
                    ]
                ),
            ]
        )
    }

    // MARK: - English (translated from the Japanese version above; keep in sync)

    private enum en {
        static let aboutTitle = "About LynkOS"
        static let aboutBody =
            "An app for sending and receiving photos, videos, documents, and other files between devices on the same Wi-Fi network."

        static let howToTitle = "How to Use"
        static let howToSteps: [String] = [
            "Connect both devices to the same Wi-Fi network",
            "Open LynkOS",
            "Select a file and tap the destination device",
            "On the receiving device, tap \u{201C}Allow\u{201D}",
        ]

        static let faqTitle = "Frequently Asked Questions"
        static let faqItems: [SupportFAQItem] = [
            SupportFAQItem(
                id: "device-not-found",
                question: "Can't find the other device",
                answer: "",
                bullets: [
                    "Check that both devices are connected to the same Wi-Fi network",
                    "Check that LynkOS is also running on the receiving device",
                    "Pull down on the screen to refresh",
                ]
            ),
            SupportFAQItem(
                id: "offline",
                question: "\u{201C}Offline\u{201D} is shown",
                answer: "",
                bullets: [
                    "Check your Wi-Fi connection and restart the app",
                    "The first connection can take up to about 30 seconds",
                    "Try turning off any VPN",
                ]
            ),
            SupportFAQItem(
                id: "cannot-send",
                question: "Can't send a file",
                answer: "",
                bullets: [
                    "Check that the destination device appears in the list",
                    "Check that the other person has seen the permission dialog",
                    "Check that a transfer isn't already in progress",
                ]
            ),
        ]

        static let contactTitle = "Contact"
        static let contactLead = "For bug reports or feature requests, please contact us by email."

        static let privacyPolicy = SupportLegalDocument(
            id: "privacy",
            title: "Privacy Policy",
            sections: [
                SupportLegalSection(
                    title: "Basic Policy",
                    paragraphs: [
                        "LynkOS only uses device and network information to the extent necessary for file transfer. It does not collect, store, or sell the contents of your files.",
                    ]
                ),
                SupportLegalSection(
                    title: "Purpose of Use",
                    paragraphs: [],
                    bullets: [
                        "File transfer, device discovery, and establishing communication",
                        "Quality improvement and troubleshooting",
                    ]
                ),
                SupportLegalSection(
                    title: "Other",
                    paragraphs: [
                        "Except where required by law, we do not provide information to third parties.",
                        "Contact: \(supportEmail)",
                        "This policy may be changed.",
                    ]
                ),
            ]
        )

        static let termsOfUse = SupportLegalDocument(
            id: "terms",
            title: "Terms of Use",
            sections: [
                SupportLegalSection(
                    title: "Agreement",
                    paragraphs: [
                        "By using this app, you are deemed to have agreed to these Terms.",
                    ]
                ),
                SupportLegalSection(
                    title: "Conditions of Use",
                    paragraphs: [],
                    bullets: [
                        "You can send and receive files between devices on the same network",
                        "The recipient's permission is required before a transfer",
                        "Users are responsible for the content they send",
                        "Infringing or unlawful use is prohibited",
                    ]
                ),
                SupportLegalSection(
                    title: "Disclaimer and Changes",
                    paragraphs: [
                        "Transfers may fail depending on network conditions. The developer bears responsibility only to the extent required by applicable law.",
                        "The service may be changed or discontinued without prior notice.",
                        "Contact: \(supportEmail)",
                    ]
                ),
            ]
        )
    }
}

struct SupportFAQItem: Identifiable, Hashable {
    let id: String
    let question: String
    let answer: String
    let bullets: [String]
}

struct SupportLegalDocument: Identifiable, Hashable {
    let id: String
    let title: String
    let sections: [SupportLegalSection]
}

struct SupportLegalSection: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let paragraphs: [String]
    var bullets: [String] = []
}
