import Foundation

/// サポート画面の文言・FAQ・法務文書。項目追加はこのファイルを編集する。
enum SupportContent {
    static let supportEmail = "bread.morn1296@gmail.com"

    static var supportMailtoURL: URL {
        URL(string: "mailto:\(supportEmail)")!
    }

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
