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

import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import reportMissingPrivateKey, { clearMissingPrivateKeyReport } from '@background/functions/reportMissingPrivateKey.js';
import storeLog from '@partials/storeLog.js';

const STORAGE_VALID = 'valid';
const STORAGE_INCOMPLETE = 'incomplete';
const STORAGE_MISSING_PRIVATE_KEY = 'missingPrivateKey';

/**
 * Classifies the current storage state for the integrity check. The private key
 * lives in IndexedDB; for users upgrading from a build that stored it as base64 in
 * storage.local this call also migrates it on first run.
 *
 *  - 'valid'             : public key + extensionID + a usable private key.
 *  - 'incomplete'        : public key OR extensionID missing (fresh install or a
 *                          partial/aborted first-run) — safe to (re)generate.
 *  - 'missingPrivateKey' : public key AND extensionID present, but NO private key
 *                          in IndexedDB — the extension was fully registered yet the
 *                          key is gone (e.g. IndexedDB evicted while storage.local
 *                          survived). Regenerating here would mint a new keypair +
 *                          registration and, since the server public_key cannot be
 *                          rotated, SILENTLY orphan every paired device.
 *
 * A transient IndexedDB error makes getOrMigratePrivateKey throw (not return null),
 * so it propagates to the caller's catch and never masquerades as 'missingPrivateKey'.
 *
 * @async
 * @param {Object} storage - The storage object to classify
 * @returns {Promise<'valid'|'incomplete'|'missingPrivateKey'>}
 */
const classifyStorage = async storage => {
  if (!storage?.keys?.publicKey || !storage?.extensionID) {
    return STORAGE_INCOMPLETE;
  }

  const privateKey = await getOrMigratePrivateKey(storage);

  return privateKey ? STORAGE_VALID : STORAGE_MISSING_PRIVATE_KEY;
};

/**
 * Verifies that required storage keys exist and regenerates default storage when it
 * is genuinely incomplete (fresh/partial install). A registered install whose private
 * key vanished is NOT silently regenerated — that would orphan the paired devices —
 * the user is told to re-pair instead. After regeneration, re-checks that the storage
 * is actually valid — generateDefaultStorage swallows API errors internally, so a
 * successful await does NOT guarantee a valid storage.
 *
 * @param {Object} browserInfo - Object containing browser name, version, and OS information
 * @returns {Promise<boolean>} A promise that resolves to true only if storage is currently valid
 */
const verifyStorageIntegrity = async browserInfo => {
  try {
    let storage = await loadFromLocalStorage(['keys', 'extensionID']);
    const state = await classifyStorage(storage);

    if (state === STORAGE_VALID) {
      await clearMissingPrivateKeyReport();

      return true;
    }

    if (state === STORAGE_MISSING_PRIVATE_KEY) {
      // Registered, but the private key is gone. Do NOT regenerate (it would orphan
      // every paired device with no way to rotate the server key). Surface a re-pair
      // prompt (once per incident) and leave storage untouched — recovery is an
      // explicit reset/re-pair.
      await reportMissingPrivateKey(storage, 'verifyStorageIntegrity');

      return false;
    }

    await generateDefaultStorage(browserInfo);

    storage = await loadFromLocalStorage(['keys', 'extensionID']);

    return (await classifyStorage(storage)) === STORAGE_VALID;
  } catch (err) {
    storeLog('error', 29, err, 'verifyStorageIntegrity');

    return false;
  }
};

export default verifyStorageIntegrity;
