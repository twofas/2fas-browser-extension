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
import { clearLocalStorage, loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import SDK from '@sdk/index.js';
import generateKeyMaterial from '@background/functions/generateKeyMaterial.js';
import storeLog from '@partials/storeLog.js';
import defaultAutoSubmitExcludedDomains from '@/defaultAutoSubmitExcludedDomains.js';
import enqueueBrowserRegistration from '@background/functions/update/enqueueBrowserRegistration.js';
import { classifyError, isRetryable, REGISTRATION_TIMEOUT_MS } from '@background/functions/update/registrationRetryPolicy.js';
import { CURRENT_SCHEMA_VERSION } from '@background/functions/storageMigrations.js';
import { defaultSigningState } from '@background/functions/signing/signingState.js';

/**
 * Generates default storage with encryption keys and registers extension with the 2FAS API.
 *
 * @param {Object} browserInfo - The browser information object
 * @returns {Promise<void>} A promise that resolves when storage is initialized and extension is registered
 */
const generateDefaultStorage = browserInfo => {
  let attempt = 0;

  return loadFromLocalStorage('attempt')
    .then(res => {
      if (res?.attempt && Number.isInteger(res?.attempt)) {
        attempt = res.attempt;
      }

      return clearLocalStorage();
    })
    .then(() => generateKeyMaterial())
    .then(keys => saveToLocalStorage({
      configured: false,
      browserInfo,
      keys,
      contextMenu: true,
      logging: false,
      incognito: false,
      nativePush: (process.env.EXT_PLATFORM !== 'Safari'),
      pinInfo: false,
      extensionVersion: config.ExtensionVersion,
      autoSubmitEnabled: false,
      autoSubmitExcludedDomains: defaultAutoSubmitExcludedDomains,
      attempt: attempt + 1,
      extIcon: 0, // 0 - default
      signing: defaultSigningState(),
      storageSchemaVersion: CURRENT_SCHEMA_VERSION
    }))
    .then(storage => {
      const extensionInstanceBody = structuredClone(browserInfo);
      extensionInstanceBody.public_key = storage.keys.publicKey;
      extensionInstanceBody.public_signing_key = storage.keys.signingPublicKey;

      return new SDK().createExtensionInstance(extensionInstanceBody, { timeoutMs: REGISTRATION_TIMEOUT_MS });
    })
    // Registration succeeded with the signing key in the payload — signing is
    // active from the first request. One atomic write with the extensionID.
    .then(data => saveToLocalStorage({ extensionID: data.id, signing: { ...defaultSigningState(), active: true } }))
    .then(storage => {
      if (process.env.EXT_PLATFORM === 'Safari') {
        return Promise.resolve();
      }

      return browser.runtime.setUninstallURL(`https://2fas.com/auth/byebye/${storage.extensionID}/`);
    })
    .catch(async err => {
      // If local storage was initialised (keys present) but server registration didn't go
      // through because of a transient/offline network failure, defer to the durable retry
      // instead of logging now — otherwise the install-time flood (error 28) reappears and the
      // extension is left permanently without an extensionID. Non-network failures still log.
      let s = null;

      try {
        s = await loadFromLocalStorage(['keys', 'extensionID', 'browserInfo']);
      } catch (e) {}

      const hasKeys = Boolean(s?.keys?.publicKey);
      const hasExtID = Boolean(s?.extensionID);

      if (hasKeys && !hasExtID && isRetryable(classifyError(err))) {
        return enqueueBrowserRegistration({ op: 'create', payload: s.browserInfo || browserInfo });
      }

      return storeLog('error', 28, err, 'generateDefaultStorage');
    });
};

export default generateDefaultStorage;
