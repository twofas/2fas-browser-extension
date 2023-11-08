//
//  AppDelegate.swift
//  2FAS - Two Factor Authentication (macOS)
//
//  Created by Zbigniew Cisiński on 11/10/2023.
//

import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
