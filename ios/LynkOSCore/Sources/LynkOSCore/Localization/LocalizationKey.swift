import Foundation

/// 画面表示文言のキー。raw value はドット区切りの識別子（例: "transfer.title"）にして、
/// 将来 JSON/strings ファイルへ移行する場合にもそのまま使えるようにしている。
public enum LocalizationKey: String, Sendable {
    // MARK: - common
    case commonCancel = "common.cancel"
    case commonSave = "common.save"
    case commonDelete = "common.delete"
    case commonClose = "common.close"

    // MARK: - language switch
    case languageSwitchToJapanese = "language.switchToJapanese"
    case languageSwitchToEnglish = "language.switchToEnglish"

    // MARK: - device list
    case deviceOffline = "device.offline"
    case deviceUpdating = "device.updating"
    case deviceSearching = "device.searching"

    // MARK: - transfer status
    case transferPickerLabel = "transfer.pickerLabel"
    case transferTabInFlight = "transfer.tabInFlight"
    case transferTabCompleted = "transfer.tabCompleted"
    case transferMetaWaitingPermission = "transfer.metaWaitingPermission"
    case transferMetaConnecting = "transfer.metaConnecting"
    case transferMetaSendingPercent = "transfer.metaSendingPercent"
    case transferMetaReceivingPercent = "transfer.metaReceivingPercent"
    case transferSavedToPhotos = "transfer.savedToPhotos"
    case transferSavedToFiles = "transfer.savedToFiles"

    // MARK: - file pick panel
    case filePickSourceTitle = "filePick.sourceTitle"
    case filePickPhotoVideo = "filePick.photoVideo"
    case filePickFile = "filePick.file"
    case filePickDeselect = "filePick.deselect"
    case filePickWaiting = "filePick.waiting"
    case filePickPrompt = "filePick.prompt"

    // MARK: - receive request dialog
    case receiveRequestPendingCount = "receiveRequest.pendingCount"
    case receiveRequestDeny = "receiveRequest.deny"
    case receiveRequestAllow = "receiveRequest.allow"

    // MARK: - save received file dialog
    case saveDialogTitle = "saveDialog.title"
    case saveDialogSaveToPhotos = "saveDialog.saveToPhotos"
    case saveDialogSaveToFiles = "saveDialog.saveToFiles"

    // MARK: - connection debug
    case connectionDebugTitle = "connectionDebug.title"
    case connectionDebugSignalingSubtitle = "connectionDebug.signalingSubtitle"
    case connectionDebugLastError = "connectionDebug.lastError"

    // MARK: - connection state labels
    case connectionStateDisconnected = "connectionState.disconnected"
    case connectionStateConnecting = "connectionState.connecting"
    case connectionStateConnected = "connectionState.connected"
    case connectionStateReconnecting = "connectionState.reconnecting"

    // MARK: - content view (top screen)
    case contentViewClearHistoryConfirmTitle = "contentView.clearHistoryConfirmTitle"
    case contentViewClearHistoryButton = "contentView.clearHistoryButton"
    case contentViewSupportA11y = "contentView.supportA11y"
    case contentViewClearHistoryA11y = "contentView.clearHistoryA11y"

    // MARK: - settings screen
    case settingsTitle = "settings.title"
    case settingsIconLabel = "settings.iconLabel"
    case settingsPhotoButton = "settings.photoButton"
    case settingsNameLabel = "settings.nameLabel"
    case settingsDeveloperMode = "settings.developerMode"
    case settingsSignalingOverrideLabel = "settings.signalingOverrideLabel"
    case settingsServerPlaceholder = "settings.serverPlaceholder"
    case settingsServerHint = "settings.serverHint"

    // MARK: - support screen
    case supportTitle = "support.title"
    case supportLegalSectionTitle = "support.legalSectionTitle"

    // MARK: - debug (developer mode only)
    case debugHubSearching = "debug.hubSearching"
    case debugInboxEventsPlaceholder = "debug.inboxEventsPlaceholder"
    case deviceNearbyFallbackName = "device.nearbyFallbackName"

    // MARK: - share extension
    case shareLoadingAttachment = "share.loadingAttachment"
    case shareSetupRequiredTitle = "share.setupRequiredTitle"
    case shareSetupRequiredSubtitle = "share.setupRequiredSubtitle"
    case shareSearchingNearbyDevices = "share.searchingNearbyDevices"
    case shareRejectedTitle = "share.rejectedTitle"
    case shareFileFallbackName = "share.fileFallbackName"
    case shareDeviceListSearching = "share.deviceListSearching"
    case shareDeviceListEmptyHint = "share.deviceListEmptyHint"
    case shareSendCompletedTitle = "share.sendCompletedTitle"
    case shareSendingToPeer = "share.sendingToPeer"
    case shareWaitingAcceptFromPeer = "share.waitingAcceptFromPeer"
    case shareConnectingToPeer = "share.connectingToPeer"
    case shareAttachmentLoadFailed = "share.attachmentLoadFailed"
    case shareServerUnreachable = "share.serverUnreachable"
    case shareSharedFileNotFound = "share.sharedFileNotFound"
    case shareGenericDeviceFallbackName = "share.genericDeviceFallbackName"
    case shareBonjourSearching = "share.bonjourSearching"
    case shareBonjourFoundCount = "share.bonjourFoundCount"
    case shareNoResponseFromPeer = "share.noResponseFromPeer"

    // MARK: - errors (persistent, shown as banners/screen state)
    case errorServerNotConfiguredLAN = "error.serverNotConfiguredLAN"
    case errorSignalingUnreachable = "error.signalingUnreachable"
    case errorDeviceListPrefix = "error.deviceListPrefix"
    case errorSendFailedPrefix = "error.sendFailedPrefix"
    case errorReceiveFailedPrefix = "error.receiveFailedPrefix"
    case errorUnknown = "error.unknown"
    case errorServerDisconnected = "error.serverDisconnected"
    case errorPeerDisconnected = "error.peerDisconnected"
    case errorConnectionLost = "error.connectionLost"
    case errorOfferProcessingFailed = "error.offerProcessingFailed"
    case errorAnswerProcessingFailed = "error.answerProcessingFailed"
    case errorOfferCreationFailed = "error.offerCreationFailed"
    case errorPeerRejectedTransfer = "error.peerRejectedTransfer"
    case errorReceiveFileCreateFailed = "error.receiveFileCreateFailed"
    case errorReceiveFileSaveFailed = "error.receiveFileSaveFailed"

    // MARK: - toasts (transient messages)
    case toastSelectFileFirst = "toast.selectFileFirst"
    case toastFileLoadFailed = "toast.fileLoadFailed"
    case toastSendRequestFailed = "toast.sendRequestFailed"
    case toastPhotoLoadFailed = "toast.photoLoadFailed"
    case toastImageLoadFailed = "toast.imageLoadFailed"
    case toastImageTooLarge = "toast.imageTooLarge"
    case toastReceiveStartFailed = "toast.receiveStartFailed"
    case toastRejectSendFailed = "toast.rejectSendFailed"
    case toastPeerRejected = "toast.peerRejected"
    case toastNoResponse = "toast.noResponse"
    case toastNotSavableToPhotos = "toast.notSavableToPhotos"
    case toastPhotoAccessDenied = "toast.photoAccessDenied"
    case toastSaveFailed = "toast.saveFailed"
    case toastSavedToPhotosNamed = "toast.savedToPhotosNamed"
    case toastFileNotFound = "toast.fileNotFound"
    case toastSavedNamed = "toast.savedNamed"
    case toastDeviceListRefreshFailedKeepAlive = "toast.deviceListRefreshFailedKeepAlive"
    case toastSentNamed = "toast.sentNamed"
    case toastReceiveFilePrepareFailed = "toast.receiveFilePrepareFailed"
}
