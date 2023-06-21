//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
//  Contributed by Grzegorz Zając. All rights reserved.
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program. If not, see <https://www.gnu.org/licenses/>
//

const browser = require('webextension-polyfill');

const config = {
  WebSocketTimeout: 3, // in minutes
  ResendPushTimeout: 10, // in seconds
  ExtensionVersion: '1.4.4',

  Texts: {
    Error: {
      General: {
        Title: browser.i18n.getMessage('errorGeneralTitle'),
        Message: browser.i18n.getMessage('errorGeneralMessage')
      },
      UndefinedError: {
        Title: browser.i18n.getMessage('errorUndefinedErrorTitle'),
        Message: browser.i18n.getMessage('errorUndefinedErrorMessage')
      },
      Timeout: {
        Title: browser.i18n.getMessage('errorTimeoutTitle'),
        Message: browser.i18n.getMessage('errorTimeoutMessage')
      },
      PushExpired: domain => {
        return {
          Title: browser.i18n.getMessage('errorPushExpiredTitle').replace('DOMAIN', domain),
          Message: browser.i18n.getMessage('errorPushExpiredMessage')
        };
      },
      WebSocket: {
        Title: browser.i18n.getMessage('errorWebSocketTitle'),
        Message: browser.i18n.getMessage('errorWebSocketMessage')
      },
      OnInstallError: {
        Title: browser.i18n.getMessage('errorOnInstallErrorTitle'),
        Message: browser.i18n.getMessage('errorOnInstallErrorMessage')
      },
      ExtNameRequired: {
        Title: browser.i18n.getMessage('errorExtNameRequiredTitle'),
        Message: browser.i18n.getMessage('errorExtNameRequiredMessage')
      },
      ExtNameMinLength: {
        Title: browser.i18n.getMessage('errorExtNameMinLengthTitle'),
        Message: browser.i18n.getMessage('errorExtNameMinLengthMessage')
      },
      ExtNameMaxLength: {
        Title: browser.i18n.getMessage('errorExtNameMaxLengthTitle'),
        Message: browser.i18n.getMessage('errorExtNameMaxLengthMessage')
      },
      ConfigFirst: {
        Title: browser.i18n.getMessage('errorConfigFirstTitle'),
        Message: browser.i18n.getMessage('errorConfigFirstMessage')
      },
      RemoveDeviceBadData: {
        Title: browser.i18n.getMessage('errorRemoveDeviceBadDataTitle'),
        Message: browser.i18n.getMessage('errorRemoveDeviceBadDataMessage')
      },
      StorageCorrupted: {
        Title: browser.i18n.getMessage('errorStorageCorruptedTitle'),
        Message: browser.i18n.getMessage('errorStorageCorruptedMessage')
      },
      InactiveTab: {
        Title: browser.i18n.getMessage('errorInactiveTabTitle'),
        Message: browser.i18n.getMessage('errorInactiveTabMessage')
      }
    },
    Warning: {
      TooSoon: diff => {
        return {
          Title: browser.i18n.getMessage('warningTooSoonTitle'),
          Message: browser.i18n.getMessage('warningTooSoonMessage').replace('DIFF', 10 - Math.round(diff))
        }
      },
      SelectInput: {
        Title: browser.i18n.getMessage('warningSelectInputTitle'),
        Message: browser.i18n.getMessage('warningSelectInputMessage')
      }
    },
    Success: {
      PushSent: {
        Title: browser.i18n.getMessage('successPushSentTitle'),
        Message: browser.i18n.getMessage('successPushSentMessage')
      },
      ExtNameUpdated: {
        Title: browser.i18n.getMessage('successExtNameUpdatedTitle'),
        Message: browser.i18n.getMessage('successExtNameUpdatedMessage')
      },
      DeviceDisconnected: {
        Title: browser.i18n.getMessage('successDeviceDisconnectedTitle'),
        Message: browser.i18n.getMessage('successDeviceDisconnectedMessage')
      },
      SafariReset: {
        Title: browser.i18n.getMessage('successSafariResetTitle'),
        Message: browser.i18n.getMessage('successSafariResetMessage')
      }
    },
    Info: {
      NativeNotifications: {
        Title: browser.i18n.getMessage('infoNativeNotificationsTitle'),
        Message: browser.i18n.getMessage('infoNativeNotificationsMessage')
      },
      EnabledNativeNotifications: browser.i18n.getMessage('infoEnabledNativeNotifications'),
      UnsupportedProtocol: {
        Title: browser.i18n.getMessage('infoUnsupportedProtocolTitle'),
        Message: browser.i18n.getMessage('infoUnsupportedProtocolMessage')
      },
      BrowserActionWithoutTab: {
        Title: browser.i18n.getMessage('infoBrowserActionWithoutTabTitle'),
        Message: browser.i18n.getMessage('infoBrowserActionWithoutTabMessage')
      },
      Test: {
        Title: browser.i18n.getMessage('infoTestTitle'),
        Message: browser.i18n.getMessage('infoTestMessage')
      }
    }
  }
};

module.exports = config;
