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

import config from '@/config.js';
import browser from 'webextension-polyfill';
import TwoFasNotification from '@notification/index.js';
import initBEAction from '@background/functions/initBEAction.js';
import saveToLocalStorage from '@localStorage/saveToLocalStorage.js';
import sendNotificationInfo from '@background/functions/sendNotificationInfo.js';
import checkIconTitleText from '@background/functions/checkIconTitleText.js';

const DEBOUNCE_THRESHOLD_SECONDS = 1;
const SUPPORTED_PROTOCOLS = ['https:', 'http:'];

/**
 * Checks if enough time has passed since the last action to proceed.
 *
 * @param {number|undefined} lastActionTime - Timestamp of the last action
 * @param {number} currentTime - Current timestamp
 * @returns {boolean} True if action should proceed, false if debounced
 */
const shouldProceedWithAction = (lastActionTime, currentTime) => {
  if (!lastActionTime) {
    return true;
  }

  const elapsedSeconds = (currentTime - lastActionTime) / 1000;

  return Math.round(elapsedSeconds) > DEBOUNCE_THRESHOLD_SECONDS;
};

/**
 * Validates that the URL protocol is supported by the extension.
 *
 * @param {URL} url - The URL object to validate
 * @param {number} tabId - The tab ID for notification display
 * @returns {boolean} True if protocol is supported, false otherwise
 */
const isProtocolSupported = (url, tabId) => {
  if (SUPPORTED_PROTOCOLS.includes(url.protocol)) {
    return true;
  }

  console.warn(`${url.protocol} ${browser.i18n.getMessage('isNotSupportedByExt')}`);
  TwoFasNotification.show(config.Texts.Info.UnsupportedProtocol, tabId);

  return false;
};

/**
 * Handles browser action for a configured extension, validating the tab and initiating the 2FA flow.
 *
 * @param {Object} tab - The browser tab object
 * @param {Object} data - The extension storage data
 * @returns {Promise<boolean>} A promise that resolves to false if action was skipped, otherwise initiates 2FA
 */
const browserActionConfigured = async (tab, data) => {
  if (!tab?.url) {
    return false;
  }

  const url = new URL(tab.url);
  const now = Date.now();

  if (!shouldProceedWithAction(data.globalLastAction, now)) {
    await saveToLocalStorage({ globalLastAction: now }, data);
    return false;
  }

  const storage = await saveToLocalStorage({ globalLastAction: now }, data);
  const isIconActive = await checkIconTitleText(tab.id);

  if (!isIconActive) {
    return false;
  }

  if (!isProtocolSupported(url, tab.id)) {
    return false;
  }

  if (!storage.notifications) {
    sendNotificationInfo(tab);
  }

  return initBEAction(url.origin, tab, storage);
};

export default browserActionConfigured;
