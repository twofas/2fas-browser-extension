//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2026 Two Factor Authentication Service, Inc.
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

import browser from 'webextension-polyfill';
import notificationTexts from './_locales/en/notifications.json';
import tokenTexts from './_locales/en/token.json';

// Bundled English fallback for every key this file resolves. Both catalogues are
// needed: the four Token.* strings live in token.json, so a notifications-only
// fallback silently produced `undefined` for them (rendered as the literal text
// "undefined" wherever it reached the DOM).
const fallbackTexts = { ...notificationTexts, ...tokenTexts };

/**
 * Resolves a localized string, falling back to the bundled English copy.
 *
 * The fallback must read `.message`: these are Chrome-i18n catalogues
 * (`{ "key": { "message": "…", "description": "" } }`), so returning the entry
 * directly handed an OBJECT to the notification APIs whenever
 * `browser.i18n.getMessage` came back empty — `notifications.create` then rejects
 * with "Invalid value for argument 1".
 *
 * @param {string} key - Message key.
 * @returns {string} The localized text, the English fallback, or ''.
 */
const msg = key => browser.i18n.getMessage(key) || fallbackTexts[key]?.message || '';

/**
 * Application configuration object containing timeouts, version, and localized text strings.
 * @type {Object}
 */
const config = {
  WebSocketTimeout: 3, // in minutes
  ResendPushTimeout: 10, // in seconds
  ExtensionVersion: browser.runtime.getManifest().version,

  Texts: {
    Error: {
      General: {
        Title: msg('errorGeneralTitle'),
        Message: msg('errorGeneralMessage')
      },
      UndefinedError: {
        Title: msg('errorUndefinedErrorTitle'),
        Message: msg('errorUndefinedErrorMessage')
      },
      Timeout: {
        Title: msg('errorTimeoutTitle'),
        Message: msg('errorTimeoutMessage')
      },
      PushExpired: domain => {
        return {
          Title: (msg('errorPushExpiredTitle')).replace('DOMAIN', domain),
          Message: msg('errorPushExpiredMessage')
        };
      },
      WebSocket: {
        Title: msg('errorWebSocketTitle'),
        Message: msg('errorWebSocketMessage')
      },
      OnInstallError: {
        Title: msg('errorOnInstallErrorTitle'),
        Message: msg('errorOnInstallErrorMessage')
      },
      ExtNameRequired: {
        Title: msg('errorExtNameRequiredTitle'),
        Message: msg('errorExtNameRequiredMessage')
      },
      ExtNameMinLength: {
        Title: msg('errorExtNameMinLengthTitle'),
        Message: msg('errorExtNameMinLengthMessage')
      },
      ExtNameMaxLength: {
        Title: msg('errorExtNameMaxLengthTitle'),
        Message: msg('errorExtNameMaxLengthMessage')
      },
      ConfigFirst: {
        Title: msg('errorConfigFirstTitle'),
        Message: msg('errorConfigFirstMessage')
      },
      RemoveDeviceBadData: {
        Title: msg('errorRemoveDeviceBadDataTitle'),
        Message: msg('errorRemoveDeviceBadDataMessage')
      },
      RemoveDomainBadData: {
        Title: msg('errorRemoveDomainBadDataTitle'),
        Message: msg('errorRemoveDomainBadDataMessage')
      },
      StorageCorrupted: {
        Title: msg('errorStorageCorruptedTitle'),
        Message: msg('errorStorageCorruptedMessage')
      },
      InactiveTab: {
        Title: msg('errorInactiveTabTitle'),
        Message: msg('errorInactiveTabMessage')
      },
      LackOfTab: {
        Title: msg('errorLackOfTabTitle'),
        Message: msg('errorLackOfTabMessage')
      },
      InputNotExist: {
        Title: msg('errorInputNotExistTitle'),
        Message: msg('errorInputNotExistMessage')
      },
      StorageIntegrity: {
        Title: msg('errorStorageIntegrityTitle'),
        Message: msg('errorStorageIntegrityMessage')
      },
      StorageRecovered: {
        Title: msg('errorStorageRecoveredTitle'),
        Message: msg('errorStorageRecoveredMessage')
      },
      ResetPending: {
        Title: msg('errorResetPendingTitle'),
        Message: msg('errorResetPendingMessage')
      },
      OldRequest: {
        Title: msg('errorOldRequestTitle'),
        Message: msg('errorOldRequestMessage')
      },
      TokenNotDelivered: {
        Title: msg('errorTokenNotDeliveredTitle'),
        Message: msg('errorTokenNotDeliveredMessage')
      },
      DeviceUnpaired: {
        Title: msg('errorDeviceUnpairedTitle'),
        Message: msg('errorDeviceUnpairedMessage')
      },
      NoInternet: {
        Title: msg('errorNoInternetTitle'),
        Message: msg('errorNoInternetMessage')
      },
      DevicesUnavailable: {
        Title: msg('errorDevicesUnavailableTitle'),
        Message: msg('errorDevicesUnavailableMessage')
      },
      SigningRequired: {
        Title: msg('errorSigningRequiredTitle'),
        Message: msg('errorSigningRequiredMessage')
      },
      SigningKeyConflict: {
        Title: msg('errorSigningKeyConflictTitle'),
        Message: msg('errorSigningKeyConflictMessage')
      }
    },
    Warning: {
      TooSoon: diff => {
        return {
          Title: msg('warningTooSoonTitle'),
          Message: (msg('warningTooSoonMessage')).replace('DIFF', config.ResendPushTimeout - Math.round(diff))
        };
      },
      CrossDomain: (currentDomain, topDomain) => {
        if (topDomain) {
          return (msg('warningCrossDomainMessage'))
            .replace('CURRENT_DOMAIN', currentDomain)
            .replace('TOP_DOMAIN', topDomain);
        }

        return (msg('warningCrossDomainNoAccessMessage'))
          .replace('CURRENT_DOMAIN', currentDomain);
      }
    },
    Success: {
      PushSent: {
        Title: msg('successPushSentTitle'),
        Message: msg('successPushSentMessage')
      },
      PushSentClipboard: {
        Title: msg('successPushSentClipboardTitle'),
        Message: msg('successPushSentClipboardMessage')
      },
      ExtNameUpdated: {
        Title: msg('successExtNameUpdatedTitle'),
        Message: msg('successExtNameUpdatedMessage')
      },
      DeviceDisconnected: {
        Title: msg('successDeviceDisconnectedTitle'),
        Message: msg('successDeviceDisconnectedMessage')
      },
      DomainExcluded: {
        Title: msg('successDomainExcludedTitle'),
        Message: msg('successDomainExcludedMessage')
      },
      DomainExcludedRemoved: {
        Title: msg('successDomainExcludedRemovedTitle'),
        Message: msg('successDomainExcludedRemovedMessage')
      }
    },
    Info: {
      UnsupportedProtocol: {
        Title: msg('infoUnsupportedProtocolTitle'),
        Message: msg('infoUnsupportedProtocolMessage')
      },
      BrowserActionWithoutTab: {
        Title: msg('infoBrowserActionWithoutTabTitle'),
        Message: msg('infoBrowserActionWithoutTabMessage')
      },
      CopiedToClipboard: {
        Title: msg('infoCopiedToClipboardTitle'),
        Message: msg('infoCopiedToClipboardMessage')
      },
      Test: {
        Title: msg('infoTestTitle'),
        Message: msg('infoTestMessage')
      }
    },
    Token: {
      Header: msg('tokenHeader'),
      Copy: msg('tokenCopy'),
      Copied: msg('tokenCopied'),
      Description: msg('tokenDescription')
    }
  }
};

export default config;
