//
//  Presenter.swift
//  2FAS - Two Factor Authentication (macOS)
//
//  Created by Zbigniew Cisiński on 12/10/2023.
//

import Foundation
import SafariServices

enum ExtensionState {
    case notDetermined
    case on
    case off
    case unknown
    
    var stateTitle: String {
        switch self {
        case .on, .off: "stateTitle".localized
        case .unknown, .notDetermined: "stateUnknown".localized
        }
    }
    
    var stateContinuation: String? {
        switch self {
        case .on, .off: "stateContinuation".localized
        case .unknown, .notDetermined: nil
        }
    }
    
    var state: String? {
        switch self {
        case .on: "stateOn".localized
        case .off: "stateOff".localized
        case .unknown, .notDetermined: nil
        }
    }
    
    var note: String? {
        switch self {
        case .on: "noteOn".localized
        case .off: "noteOff".localized
        case .unknown, .notDetermined: nil
        }
    }
}

final class Presenter: ObservableObject {
    private let extensionBundleIdentifier = "com.twofas.org.browser.extension"
    
    @Published var somethingWentWrong = false
    @Published var extensionState: ExtensionState = .notDetermined
    
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
                DispatchQueue.main.async {
                    self?.extensionState = .unknown
                    self?.somethingWentWrong = true
                }
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
                DispatchQueue.main.async {
                    self?.somethingWentWrong = true
                }
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
