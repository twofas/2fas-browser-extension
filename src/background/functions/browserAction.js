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
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import browserActionConfigured from '@background/functions/browserActionConfigured.js';
import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';

/**
 * Handles browser action click to initiate 2FA token request.
 *
 * @param {Object} tab - The browser tab object
 * @returns {Promise<void>} A promise that resolves when the action is handled
 */
const browserAction = async tab => {
  if (!tab || !tab.url) {
    console.warn(config.Texts.Info.BrowserActionWithoutTab.Message);
    return TwoFasNotification.show(config.Texts.Info.BrowserActionWithoutTab, tab?.id);
  }

  try {
    const storage = await loadFromLocalStorage(null);

    if (!storage.configured) {
      const extInstallPageURL = browser.runtime.getURL('/installPage/installPage.html');

      if (tab.url === extInstallPageURL) {
        console.warn(config.Texts.Error.ConfigFirst.Message);
        return TwoFasNotification.show(config.Texts.Error.ConfigFirst, tab.id);
      }

      return openInstallPage();
    }

    return browserActionConfigured(tab, storage);
  } catch (err) {
    return storeLog('error', 4, err, tab.url);
  }
};

export default browserAction;
