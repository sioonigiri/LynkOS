import SwiftUI
import UIKit

/// Share Extension のエントリ。SwiftUI 画面を共有シート内に表示する。
final class ShareViewController: UIViewController {
    private var viewModel: ShareExtensionViewModel?
    private var hostingController: UIHostingController<ShareExtensionView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let viewModel = ShareExtensionViewModel(extensionContext: extensionContext)
        self.viewModel = viewModel

        let rootView = ShareExtensionView(viewModel: viewModel)
        let host = UIHostingController(rootView: rootView)
        hostingController = host

        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)

        preferredContentSize = CGSize(width: 360, height: 520)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        viewModel?.cleanup()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let viewModel else { return }
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        Task { await viewModel.start(with: items) }
    }
}
