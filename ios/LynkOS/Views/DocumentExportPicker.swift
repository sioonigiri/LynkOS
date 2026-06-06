import LynkOSCore
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// 受信ファイルを Files アプリ等へエクスポート（ルート VC からモーダル表示）。
struct DocumentExportHostView: UIViewControllerRepresentable {
    let url: URL
    let onFinished: (Bool) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onFinished: onFinished)
    }

    func makeUIViewController(context: Context) -> DocumentExportHostViewController {
        let controller = DocumentExportHostViewController()
        controller.exportURL = url
        controller.coordinator = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: DocumentExportHostViewController, context: Context) {}

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onFinished: (Bool) -> Void
        private var didFinish = false

        init(onFinished: @escaping (Bool) -> Void) {
            self.onFinished = onFinished
        }

        func finish(_ saved: Bool) {
            guard !didFinish else { return }
            didFinish = true
            Task { @MainActor in
                onFinished(saved)
            }
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            controller.dismiss(animated: true) { [weak self] in
                self?.finish(false)
            }
        }

        func documentPicker(
            _ controller: UIDocumentPickerViewController,
            didPickDocumentsAt urls: [URL]
        ) {
            controller.dismiss(animated: true) { [weak self] in
                self?.finish(!urls.isEmpty)
            }
        }
    }
}

/// 透明なホスト。`viewDidAppear` で UIDocumentPicker を提示する（SwiftUI .sheet 内だと固まることがある）。
final class DocumentExportHostViewController: UIViewController {
    var exportURL: URL?
    weak var coordinator: DocumentExportHostView.Coordinator?

    private var didPresentPicker = false

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        presentExportPickerIfNeeded()
    }

    private func presentExportPickerIfNeeded() {
        guard !didPresentPicker else { return }
        didPresentPicker = true

        guard let url = exportURL, ReceivedFileStorage.fileExists(at: url) else {
            coordinator?.finish(false)
            return
        }

        let picker = UIDocumentPickerViewController(forExporting: [url.standardizedFileURL], asCopy: true)
        picker.delegate = coordinator
        picker.allowsMultipleSelection = false
        picker.modalPresentationStyle = .formSheet
        present(picker, animated: true)
    }
}
