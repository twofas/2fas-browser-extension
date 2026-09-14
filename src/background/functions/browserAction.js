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
import browserActionConfigured, { isSupportedTabURL } from '@background/functions/browserActionConfigured.js';
import syncDevicesWithAPI from '@background/functions/syncDevicesWithAPI.js';
import selfHealMissingPrivateKey, { HEAL_KEY_PRESENT, HEAL_REGENERATED } from '@background/functions/selfHealMissingPrivateKey.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import reportMissingPrivateKey from '@background/functions/reportMissingPrivateKey.js';
import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';

/**
 * Whether a tab URL is the extension's install page, ignoring any query string
 * or fragment (the self-heal opens it as installPage.html?reason=recovered).
 * Plain string compare on purpose: URL.origin is "null" for non-special schemes
 * (safari-web-extension://, moz-extension:// in some engines), so it cannot be
 * used to rebuild the extension URL portably.
 *
 * @param {string} url - The tab URL.
 * @returns {boolean}
 */
const isInstallPageURL = url =>
  typeof url === 'string' && url.split(/[?#]/)[0] === browser.runtime.getURL('/installPage/installPage.html');

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
    let storage = await loadFromLocalStorage(null);

    if (!storage.configured) {
      if (isInstallPageURL(tab.url)) {
        console.warn(config.Texts.Error.ConfigFirst.Message);
        return TwoFasNotification.show(config.Texts.Error.ConfigFirst, tab.id);
      }

      return openInstallPage();
    }

    // Pre-flight. Every entry point — toolbar click, keyboard shortcut, context menu
    // — funnels through here, so this is the one place that can stop a request the
    // extension already knows it cannot finish. Without it the user watches the whole
    // flow succeed (request sent, phone rings, approve) and only learns at delivery
    // time that the token is undecryptable, having spent a backend request and a push
    // for nothing.
    //
    // Only on a tab that could actually carry a request: a click on chrome://,
    // about: or a PDF viewer never reaches initBEAction, so healing there would wipe
    // the identity for an action that was going nowhere — and the explanation would
    // be invisible, because those pages have no content script to render it.
    //
    // Only the RSA key is consulted. A missing SIGNING key is a different failure
    // (tokens still decrypt; see keyMaterialState) and must never trigger a wipe.
    // The read costs one IndexedDB lookup that the decrypt path performs anyway, and
    // a transient IndexedDB failure THROWS rather than resolving null, so it lands in
    // the catch below as error 4 instead of being mistaken for key loss.
    if (isSupportedTabURL(tab.url) && !(await getOrMigratePrivateKey(storage))) {
      // `userInitiated`: the user is waiting, and no token can ever be decrypted with
      // this identity, so regenerate and send them to the pairing page on every
      // platform rather than showing a dead-end notification (the background integrity
      // check keeps the report-only policy outside Safari — see mayRegenerate).
      const outcome = await selfHealMissingPrivateKey(storage, 'browserAction', { userInitiated: true });

      if (outcome === HEAL_REGENERATED) {
        return TwoFasNotification.show(config.Texts.Error.StorageRecovered, tab.id);
      }

      if (outcome !== HEAL_KEY_PRESENT) {
        // The heal did not run or failed: fall back to the deduped report and tell the
        // user what to do. This notification carries a tabID, so it renders in the page
        // even when the user turned native notifications off.
        await reportMissingPrivateKey(storage, 'browserAction', { notify: false });

        return TwoFasNotification.show(config.Texts.Error.StorageIntegrity, tab.id);
      }

      // HEAL_KEY_PRESENT: the re-read found the key — nothing was touched and the
      // request can go ahead.
      storage = await loadFromLocalStorage(null);
    }

    const syncResult = await syncDevicesWithAPI(storage);
    storage = syncResult.storage;

    if (syncResult.offline) {
      return TwoFasNotification.show(config.Texts.Error.NoInternet, tab.id);
    }

    if (syncResult.apiError) {
      return TwoFasNotification.show(config.Texts.Error.DevicesUnavailable, tab.id);
    }

    if (!syncResult.hasDevices) {
      return openInstallPage();
    }

    return browserActionConfigured(tab, storage);
  } catch (err) {
    return storeLog('error', 4, err, tab.url);
  }
};

export default browserAction;
