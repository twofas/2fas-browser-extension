//
//  Presenter.swift
//  2FAS - Two Factor Authentication (macOS)
//
//  Created by Zbigniew Cisiński on 12/10/2023.
//

import Foundation
import SafariServices

enum ExtensionState {
    case on
    case off
    case unknown
    
    var stateTitle: String {
        switch self {
        case .on, .off: "stateTitle".localized
        case .unknown: "stateUnknown".localized
        }
    }
    
    var stateContinuation: String? {
        switch self {
        case .on, .off: "stateContinuation".localized
        case .unknown: nil
        }
    }
    
    var state: String? {
        switch self {
        case .on: "stateOn".localized
        case .off: "stateOff".localized
        case .unknown: nil
        }
    }
    
    var note: String? {
        switch self {
        case .on: "noteOn".localized
        case .off: "noteOff".localized
        case .unknown: nil
        }
    }
}

final class Presenter: ObservableObject {
    private let extensionBundleIdentifier = "com.twofas.org.browser.extension"
    
    @Published var somethingWentWrong = false
    @Published var extensionState: ExtensionState = .unknown
    
    var buttonCTA: String {
        "buttonCTA".localized
    }
    
    var alertTitle: String {
        "errorTitle".localized
    }
    
    var alertDescription: String {
        "errorContent".localized
    }
    
    func updateState() {
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: extensionBundleIdentifier
        ) { [weak self] (state, error) in
            guard let state = state, error == nil else {
                self?.extensionState = .unknown
                self?.somethingWentWrong = true
                return
            }

            DispatchQueue.main.async {
                self?.extensionState = state.isEnabled ? .on : .off
            }
        }
    }
    
    func handleOpenSettings() {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: extensionBundleIdentifier
        ) { [weak self] error in
            guard error == nil else {
                self?.somethingWentWrong = true
                return
            }

            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }
}

extension String {
    var localized: String {
        NSLocalizedString(self, comment: "")
    }
}
