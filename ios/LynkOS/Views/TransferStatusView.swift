import LynkOSCore
import SwiftUI

struct TransferStatusView: View {
    @ObservedObject private var loc = LocalizationManager.shared
    let activeTransfer: AppViewModel.ActiveTransferDisplay?
    let completedRecords: [ReceivedFileRecord]

    @State private var tab: Tab = .inFlight

    private enum Tab {
        case inFlight
        case completed
    }

    private var hasInFlight: Bool { activeTransfer != nil }
    private var hasCompleted: Bool { !completedRecords.isEmpty }

    var body: some View {
        if !hasInFlight && !hasCompleted {
            EmptyView()
        } else {
            VStack(spacing: 12) {
                if hasInFlight || hasCompleted {
                    Picker(L(.transferPickerLabel), selection: $tab) {
                        Text(L(.transferTabInFlight)).tag(Tab.inFlight)
                        Text(L(.transferTabCompleted)).tag(Tab.completed)
                    }
                    .pickerStyle(.segmented)
                    .onAppear { syncTab() }
                    .onChange(of: hasInFlight) { _, _ in syncTab() }
                    .onChange(of: hasCompleted) { _, _ in syncTab() }
                }

                if tab == .inFlight, let transfer = activeTransfer {
                    transferRow(
                        icon: transfer.isSending ? "arrow.up.circle" : "arrow.down.circle",
                        name: transfer.name,
                        meta: transfer.meta,
                        progress: transfer.progress
                    )
                } else if tab == .inFlight && hasCompleted {
                    Text("—")
                        .font(.caption)
                        .foregroundStyle(LynkOSTheme.textMuted)
                        .frame(maxWidth: .infinity)
                }

                if tab == .completed {
                    if completedRecords.isEmpty {
                        Text("—")
                            .font(.caption)
                            .foregroundStyle(LynkOSTheme.textMuted)
                            .frame(maxWidth: .infinity)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(completedRecords) { record in
                                transferRow(
                                    icon: record.destination == .photos
                                        ? "photo.on.rectangle.angled"
                                        : "folder",
                                    name: record.name,
                                    meta: record.statusLabel,
                                    progress: nil
                                )
                            }
                        }
                    }
                }
            }
            .padding(14)
            .background(LynkOSTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(LynkOSTheme.border, lineWidth: 1)
            )
        }
    }

    private func syncTab() {
        if hasInFlight {
            tab = .inFlight
        } else if hasCompleted {
            tab = .completed
        }
    }

    @ViewBuilder
    private func transferRow(
        icon: String,
        name: String,
        meta: String,
        progress: Int?
    ) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(LynkOSTheme.accent)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LynkOSTheme.text)
                        .lineLimit(1)
                    Text(meta)
                        .font(.caption)
                        .foregroundStyle(LynkOSTheme.textSub)
                }

                Spacer(minLength: 0)
            }

            if let progress {
                ProgressView(value: Double(progress), total: 100)
                    .tint(LynkOSTheme.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
