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

// The only keys a caller may carry across a regeneration: user preferences, nothing
// else. An allow-list rather than a "these are overridden anyway" convention — a
// leaked `extensionID` would pair the OLD registration with the NEW keys (the catch
// below then skips the durable create because an extensionID is present), producing
// an install that classifies as healthy and can never decrypt a token.
const OVERRIDABLE_PREFERENCES = [
  'logging',
  'nativePush',
  'contextMenu',
  'pinInfo',
  'incognito',
  'autoSubmitEnabled',
  'autoSubmitExcludedDomains',
  'extIcon',
  // The one non-preference: the self-heal's repeat counter. It has to survive the
  // regeneration precisely because the regeneration is what it counts (see
  // selfHealMissingPrivateKey). A manual Reset passes no overrides, so it drops it.
  'selfHealHistory'
];

/**
 * Keeps only the preference keys a regeneration may carry over.
 *
 * @param {Object} [overrides] - Raw overrides from the caller.
 * @returns {Object} The allowed subset.
 */
const pickPreferences = (overrides = {}) => {
  const out = {};

  if (!overrides || typeof overrides !== 'object') {
    return out;
  }

  for (const key of OVERRIDABLE_PREFERENCES) {
    if (overrides[key] !== undefined) {
      out[key] = overrides[key];
    }
  }

  return out;
};

/**
 * Generates default storage with encryption keys and registers extension with the 2FAS API.
 *
 * @param {Object} browserInfo - The browser information object
 * @param {Object} [overrides={}] - Preference values written atomically with the defaults
 *   (e.g. settings carried across an automatic regeneration). Only the keys in
 *   OVERRIDABLE_PREFERENCES are honoured; everything else — identity, pairing,
 *   registration and reporting state — is dropped, never merged.
 * @returns {Promise<void>} A promise that resolves when storage is initialized and extension is registered
 */
const runGeneration = (browserInfo, overrides = {}) => {
  let attempt = 0;

  return loadFromLocalStorage('attempt')
    .then(res => {
      if (res?.attempt && Number.isInteger(res?.attempt)) {
        attempt = res.attempt;
      }

      return clearLocalStorage();
    })
    // Re-arm the attempt counter BEFORE the fallible work. `clearLocalStorage` has
    // already dropped it, and everything after this point can throw (crypto,
    // storage.local quota/corruption); leaving storage at `{}` would reset the
    // pages' `attempt > 5` bound, so a failing reset could be retried forever.
    .then(() => saveToLocalStorage({ attempt: attempt + 1 }))
    .then(() => generateKeyMaterial())
    .then(keys => saveToLocalStorage({
      contextMenu: true,
      logging: false,
      incognito: false,
      nativePush: (process.env.EXT_PLATFORM !== 'Safari'),
      pinInfo: false,
      autoSubmitEnabled: false,
      autoSubmitExcludedDomains: defaultAutoSubmitExcludedDomains,
      extIcon: 0, // 0 - default
      ...pickPreferences(overrides),
      // Identity — never overridable.
      configured: false,
      browserInfo,
      keys,
      extensionVersion: config.ExtensionVersion,
      attempt: attempt + 1,
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

// Single-flight: reachable from onInstalled, onStartup (Safari), storageReset and
// the Safari self-heal, which can overlap at a browser start. Two interleaved
// runs (clear → keys → POST → extensionID) can register the keys of one run
// under the extensionID of the other — a silently undecryptable install. A
// concurrent caller joins the run in progress instead — and the FIRST caller's
// arguments (browserInfo, overrides) win; the joiner's are dropped. The only
// realistic overlap is the Safari self-heal (stored name, preserved preferences)
// against a manual storageReset (fresh name, defaults): either outcome is a
// valid fresh identity, so no queueing.
let inFlight = null;

const generateDefaultStorage = (browserInfo, overrides = {}) => {
  if (inFlight) {
    return inFlight;
  }

  inFlight = runGeneration(browserInfo, overrides).finally(() => {
    inFlight = null;
  });

  return inFlight;
};

export default generateDefaultStorage;
export { OVERRIDABLE_PREFERENCES };
