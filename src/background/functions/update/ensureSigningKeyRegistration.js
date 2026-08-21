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

import { loadFromLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';
import ensureUsableSigningKeyMaterial from '@background/functions/signing/ensureUsableSigningKeyMaterial.js';
import enqueueBrowserRegistration from './enqueueBrowserRegistration.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';

/**
 * v1.9.0 migration driver for installs upgraded from ≤1.8.4: makes sure a
 * usable ECDSA signing keypair exists locally (generated + persisted BEFORE
 * anything is sent — a lost response must never orphan the only key copy) and
 * queues its backend registration through the durable update path
 * (flushBrowserRegistration.sendUpdate attaches public_signing_key to the PUT
 * whenever signing is not yet active).
 *
 * Idempotent and cheap — called from onInstalled (update) and onStartup so a
 * dropped registration (non-retryable failure, dead record) is re-attempted
 * on every browser start until the key is registered, the migration window
 * closes (401 → registrationRequired via the SDK classifier), or a key
 * conflict is detected.
 *
 * Skips when:
 *  - there is no extensionID yet (the create path registers the key itself);
 *  - signing is already active or in conflict;
 *  - re-registration was flagged as required (reinstall is the only fix);
 *  - a 'create' record is pending (its success sets signing.active).
 *
 * @async
 * @returns {Promise<void>} Always resolves — failures are logged, never thrown.
 */
const ensureSigningKeyRegistration = async () => {
  try {
    const storage = await loadFromLocalStorage(['extensionID', 'browserInfo', 'signing', REGISTRATION_STORAGE_KEY]);

    if (!storage?.extensionID || typeof storage.extensionID !== 'string') {
      return;
    }

    const signing = storage?.signing;

    if (signing?.active || signing?.conflict || signing?.registrationRequired) {
      return;
    }

    if (storage?.[REGISTRATION_STORAGE_KEY]?.op === 'create') {
      return;
    }

    try {
      await ensureUsableSigningKeyMaterial();
    } catch (err) {
      // Transient IndexedDB failure or key generation error — retried on the
      // next startup/update. Logged (deduped by storeLog) so a persistently
      // failing device is visible.
      await storeLog('error', 63, err, 'ensureSigningKeyRegistration - key material');
      return;
    }

    await enqueueBrowserRegistration({
      op: 'update',
      payload: {
        name: storage?.browserInfo?.name,
        browser_name: storage?.browserInfo?.browser_name,
        browser_version: storage?.browserInfo?.browser_version
      }
    });
  } catch (err) {
    await storeLog('error', 63, err, 'ensureSigningKeyRegistration');
  }
};

export default ensureSigningKeyRegistration;
