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
const t = require('./_locales/en/notifications.json');

const config = {
  WebSocketTimeout: 3, // in minutes
  ResendPushTimeout: 10, // in seconds
  ExtensionVersion: '1.7.0',

  Texts: {
    Error: {
      General: {
        Title: browser.i18n.getMessage('errorGeneralTitle') || t.errorGeneralTitle,
        Message: browser.i18n.getMessage('errorGeneralMessage') || t.errorGeneralMessage
      },
      UndefinedError: {
        Title: browser.i18n.getMessage('errorUndefinedErrorTitle') || t.errorUndefinedErrorTitle,
        Message: browser.i18n.getMessage('errorUndefinedErrorMessage') || t.errorUndefinedErrorMessage
      },
      Timeout: {
        Title: browser.i18n.getMessage('errorTimeoutTitle') || t.errorTimeoutTitle,
        Message: browser.i18n.getMessage('errorTimeoutMessage') || t.errorTimeoutMessage
      },
      PushExpired: domain => {
        return {
          Title: (browser.i18n.getMessage('errorPushExpiredTitle') || t.errorPushExpiredTitle).replace('DOMAIN', domain),
          Message: browser.i18n.getMessage('errorPushExpiredMessage') || t.errorPushExpiredMessage
        };
      },
      WebSocket: {
        Title: browser.i18n.getMessage('errorWebSocketTitle') || t.errorWebSocketTitle,
        Message: browser.i18n.getMessage('errorWebSocketMessage') || t.errorWebSocketMessage
      },
      OnInstallError: {
        Title: browser.i18n.getMessage('errorOnInstallErrorTitle') || t.errorOnInstallErrorTitle,
        Message: browser.i18n.getMessage('errorOnInstallErrorMessage') || t.errorOnInstallErrorMessage
      },
      ExtNameRequired: {
        Title: browser.i18n.getMessage('errorExtNameRequiredTitle') || t.errorExtNameRequiredTitle,
        Message: browser.i18n.getMessage('errorExtNameRequiredMessage') || t.errorExtNameRequiredMessage
      },
      ExtNameMinLength: {
        Title: browser.i18n.getMessage('errorExtNameMinLengthTitle') || t.errorExtNameMinLengthTitle,
        Message: browser.i18n.getMessage('errorExtNameMinLengthMessage') || t.errorExtNameMinLengthMessage
      },
      ExtNameMaxLength: {
        Title: browser.i18n.getMessage('errorExtNameMaxLengthTitle') || t.errorExtNameMaxLengthTitle,
        Message: browser.i18n.getMessage('errorExtNameMaxLengthMessage') || t.errorExtNameMaxLengthMessage
      },
      ConfigFirst: {
        Title: browser.i18n.getMessage('errorConfigFirstTitle') || t.errorConfigFirstTitle,
        Message: browser.i18n.getMessage('errorConfigFirstMessage') || t.errorConfigFirstMessage
      },
      RemoveDeviceBadData: {
        Title: browser.i18n.getMessage('errorRemoveDeviceBadDataTitle') || t.errorRemoveDeviceBadDataTitle,
        Message: browser.i18n.getMessage('errorRemoveDeviceBadDataMessage') || t.errorRemoveDeviceBadDataMessage
      },
      RemoveDomainBadData: {
        Title: browser.i18n.getMessage('errorRemoveDomainBadDataTitle') || t.errorRemoveDomainBadDataTitle,
        Message: browser.i18n.getMessage('errorRemoveDomainBadDataMessage') || t.errorRemoveDomainBadDataMessage
      },
      StorageCorrupted: {
        Title: browser.i18n.getMessage('errorStorageCorruptedTitle') || t.errorStorageCorruptedTitle,
        Message: browser.i18n.getMessage('errorStorageCorruptedMessage') || t.errorStorageCorruptedMessage
      },
      InactiveTab: {
        Title: browser.i18n.getMessage('errorInactiveTabTitle') || t.errorInactiveTabTitle,
        Message: browser.i18n.getMessage('errorInactiveTabMessage') || t.errorInactiveTabMessage
      },
      LackOfTab: {
        Title: browser.i18n.getMessage('errorLackOfTabTitle') || t.errorLackOfTabTitle,
        Message: browser.i18n.getMessage('errorLackOfTabMessage') || t.errorLackOfTabMessage
      },
      InputNotExist: {
        Title: browser.i18n.getMessage('errorInputNotExistTitle') || t.errorInputNotExistTitle,
        Message: browser.i18n.getMessage('errorInputNotExistMessage') || t.errorInputNotExistMessage
      },
      StorageIntegrity: {
        Title: browser.i18n.getMessage('errorStorageIntegrityTitle') || t.errorStorageIntegrityTitle,
        Message: browser.i18n.getMessage('errorStorageIntegrityMessage') || t.errorStorageIntegrityMessage
      }
    },
    Warning: {
      TooSoon: diff => {
        return {
          Title: browser.i18n.getMessage('warningTooSoonTitle') || t.warningTooSoonTitle,
          Message: (browser.i18n.getMessage('warningTooSoonMessage') || t.warningTooSoonMessage).replace('DIFF', 10 - Math.round(diff))
        }
      },
      SelectInput: {
        Title: browser.i18n.getMessage('warningSelectInputTitle') || t.warningSelectInputTitle,
        Message: browser.i18n.getMessage('warningSelectInputMessage') || t.warningSelectInputMessage
      }
    },
    Success: {
      PushSent: {
        Title: browser.i18n.getMessage('successPushSentTitle') || t.successPushSentTitle,
        Message: browser.i18n.getMessage('successPushSentMessage') || t.successPushSentMessage
      },
      PushSentClipboard: {
        Title: browser.i18n.getMessage('successPushSentClipboardTitle') || t.successPushSentClipboardTitle,
        Message: browser.i18n.getMessage('successPushSentClipboardMessage') || t.successPushSentClipboardMessage
      },
      ExtNameUpdated: {
        Title: browser.i18n.getMessage('successExtNameUpdatedTitle') || t.successExtNameUpdatedTitle,
        Message: browser.i18n.getMessage('successExtNameUpdatedMessage') || t.successExtNameUpdatedMessage
      },
      DeviceDisconnected: {
        Title: browser.i18n.getMessage('successDeviceDisconnectedTitle') || t.successDeviceDisconnectedTitle,
        Message: browser.i18n.getMessage('successDeviceDisconnectedMessage') || t.successDeviceDisconnectedMessage
      },
      SafariReset: {
        Title: browser.i18n.getMessage('successSafariResetTitle') || t.successSafariResetTitle,
        Message: browser.i18n.getMessage('successSafariResetMessage') || t.successSafariResetMessage
      },
      DomainExcluded: {
        Title: browser.i18n.getMessage('successDomainExcludedTitle') || t.successDomainExcludedTitle,
        Message: browser.i18n.getMessage('successDomainExcludedMessage') || t.successDomainExcludedMessage
      },
      DomainExcludedRemoved: {
        Title: browser.i18n.getMessage('successDomainExcludedRemovedTitle') || t.successDomainExcludedRemovedTitle,
        Message: browser.i18n.getMessage('successDomainExcludedRemovedMessage') || t.successDomainExcludedRemovedMessage
      }
    },
    Info: {
      NativeNotifications: {
        Title: browser.i18n.getMessage('infoNativeNotificationsTitle') || t.infoNativeNotificationsTitle,
        Message: browser.i18n.getMessage('infoNativeNotificationsMessage') || t.infoNativeNotificationsMessage
      },
      EnabledNativeNotifications: browser.i18n.getMessage('infoEnabledNativeNotifications') || t.infoEnabledNativeNotifications,
      UnsupportedProtocol: {
        Title: browser.i18n.getMessage('infoUnsupportedProtocolTitle') || t.infoUnsupportedProtocolTitle,
        Message: browser.i18n.getMessage('infoUnsupportedProtocolMessage') || t.infoUnsupportedProtocolMessage
      },
      BrowserActionWithoutTab: {
        Title: browser.i18n.getMessage('infoBrowserActionWithoutTabTitle') || t.infoBrowserActionWithoutTabTitle,
        Message: browser.i18n.getMessage('infoBrowserActionWithoutTabMessage') || t.infoBrowserActionWithoutTabMessage
      },
      CopiedToClipboard: {
        Title: browser.i18n.getMessage('infoCopiedToClipboardTitle') || t.infoCopiedToClipboardTitle,
        Message: browser.i18n.getMessage('infoCopiedToClipboardMessage') || t.infoCopiedToClipboardMessage
      },
      Test: {
        Title: browser.i18n.getMessage('infoTestTitle') || t.infoTestTitle,
        Message: browser.i18n.getMessage('infoTestMessage') || t.infoTestMessage
      }
    }
  }
};

module.exports = config;
