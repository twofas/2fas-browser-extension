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
import classifyKeyMaterial, { missingKeyName, KEY_MATERIAL_VALID } from '@background/functions/keyMaterialState.js';
import reportMissingPrivateKey, { clearMissingPrivateKeyReport } from '@background/functions/reportMissingPrivateKey.js';
import selfHealMissingPrivateKey from '@background/functions/selfHealMissingPrivateKey.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import storeLog from '@partials/storeLog.js';

const STORAGE_VALID = KEY_MATERIAL_VALID;
const STORAGE_INCOMPLETE = 'incomplete';

/**
 * Classifies the current storage state for the integrity check.
 *
 *  - 'valid'             : public key + extensionID + usable key material
 *                          (see classifyKeyMaterial).
 *  - 'incomplete'        : public key OR extensionID missing (fresh install or a
 *                          partial/aborted first-run) — safe to (re)generate.
 *  - 'missingPrivateKey' /
 *    'missingSigningKey' : registered, but a private key is gone (e.g. the
 *                          extension-origin IndexedDB was lost while storage.local
 *                          survived). Regenerating here would mint a new keypair +
 *                          registration and, since the server public_key cannot be
 *                          rotated, SILENTLY orphan every paired device.
 *
 * A transient IndexedDB error makes the key stores throw (not return null), so it
 * propagates to the caller's catch and never masquerades as a missing key.
 *
 * @async
 * @param {Object} storage - The storage object to classify
 * @returns {Promise<'valid'|'incomplete'|'missingPrivateKey'|'missingSigningKey'>}
 */
const classifyStorage = async storage => {
  if (!storage?.keys?.publicKey || !storage?.extensionID) {
    return STORAGE_INCOMPLETE;
  }

  return classifyKeyMaterial(storage);
};

/**
 * Verifies that required storage keys exist and regenerates default storage when it
 * is genuinely incomplete (fresh/partial install). A registered install whose private
 * key vanished is NOT silently regenerated — that would orphan the paired devices —
 * the user is told to re-pair instead; on Safari, where that advice cannot work and
 * the pairings are already dead, selfHealMissingPrivateKey regenerates and opens the
 * install page instead. After regeneration, re-checks that the storage
 * is actually valid — generateDefaultStorage swallows API errors internally, so a
 * successful await does NOT guarantee a valid storage.
 *
 * @param {Object} browserInfo - Object containing browser name, version, and OS information
 * @returns {Promise<boolean>} A promise that resolves to true only if storage is currently valid
 */
const verifyStorageIntegrity = async browserInfo => {
  try {
    let storage = await loadFromLocalStorage(['keys', 'extensionID', 'signing', REGISTRATION_STORAGE_KEY]);
    const state = await classifyStorage(storage);

    if (state === STORAGE_VALID) {
      await clearMissingPrivateKeyReport();

      return true;
    }

    if (state !== STORAGE_INCOMPLETE) {
      // Registered, but a private key is gone. Safari self-heals here (regenerate +
      // install page); everywhere else do NOT regenerate (it would orphan every
      // paired device with no way to rotate the server key) — report once per
      // incident and leave storage untouched, recovery is an explicit reset/re-pair.
      // A lost RSA key prompts the user (no token can be decrypted); a lost signing
      // key is logged only — tokens still work and the 401 path owns the UX later.
      const key = missingKeyName(state);

      // Regenerated (or the re-read found the key after all): re-classify what is
      // in storage now instead of trusting the outcome.
      if (await selfHealMissingPrivateKey(storage, 'verifyStorageIntegrity', { key })) {
        storage = await loadFromLocalStorage(['keys', 'extensionID', 'signing']);

        if ((await classifyStorage(storage)) === STORAGE_VALID) {
          await clearMissingPrivateKeyReport();

          return true;
        }

        return false;
      }

      await reportMissingPrivateKey(storage, 'verifyStorageIntegrity', { notify: key === 'rsa', cause: { key } });

      return false;
    }

    // Keys written but the registration POST still pending (install / reset while
    // offline): the durable create retry owns it — regenerating here would discard
    // it, mint new keys and bump `attempt`. Not valid yet either (nothing to update).
    if (storage?.keys?.publicKey && storage?.[REGISTRATION_STORAGE_KEY]?.op === 'create') {
      return false;
    }

    await generateDefaultStorage(browserInfo);

    storage = await loadFromLocalStorage(['keys', 'extensionID', 'signing']);

    return (await classifyStorage(storage)) === STORAGE_VALID;
  } catch (err) {
    storeLog('error', 29, err, 'verifyStorageIntegrity');

    return false;
  }
};

export default verifyStorageIntegrity;
