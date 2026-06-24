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
import storeLog from '@partials/storeLog.js';

/**
 * Checks if the storage contains a valid public key, extension ID and a private
 * key. The private key lives in IndexedDB; for users upgrading from a build that
 * stored it as base64 in storage.local this call also migrates it on first run.
 *
 * @async
 * @param {Object} storage - The storage object to validate
 * @returns {Promise<boolean>} True if storage has valid keys and extension ID
 */
const isStorageValid = async storage => {
  if (!storage?.keys?.publicKey || !storage?.extensionID) {
    return false;
  }

  const privateKey = await getOrMigratePrivateKey(storage);

  return Boolean(privateKey);
};

/**
 * Verifies that required storage keys exist and regenerates default storage if corrupted.
 * After regeneration, re-checks that the storage is actually valid — generateDefaultStorage
 * swallows API errors internally, so a successful await does NOT guarantee a valid storage.
 *
 * @param {Object} browserInfo - Object containing browser name, version, and OS information
 * @returns {Promise<boolean>} A promise that resolves to true only if storage is currently valid
 */
const verifyStorageIntegrity = async browserInfo => {
  try {
    let storage = await loadFromLocalStorage(['keys', 'extensionID']);

    if (await isStorageValid(storage)) {
      return true;
    }

    await generateDefaultStorage(browserInfo);

    storage = await loadFromLocalStorage(['keys', 'extensionID']);

    return await isStorageValid(storage);
  } catch (err) {
    storeLog('error', 29, err, 'verifyStorageIntegrity');

    return false;
  }
};

export default verifyStorageIntegrity;
