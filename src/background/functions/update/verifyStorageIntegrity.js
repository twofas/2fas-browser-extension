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
import storeLog from '@partials/storeLog.js';

/**
 * Checks if the storage contains valid encryption keys and extension ID.
 *
 * @param {Object} storage - The storage object to validate
 * @returns {boolean} True if storage has valid keys and extension ID
 */
const isStorageValid = storage => {
  if (!storage?.keys || !storage?.extensionID) {
    return false;
  }

  const { publicKey, privateKey } = storage.keys;

  return Boolean(publicKey && privateKey);
};

/**
 * Verifies that required storage keys exist and regenerates default storage if corrupted.
 *
 * @param {Object} browserInfo - Object containing browser name, version, and OS information
 * @returns {Promise<boolean>} A promise that resolves to true if storage is valid or was successfully regenerated
 */
const verifyStorageIntegrity = async browserInfo => {
  try {
    const storage = await loadFromLocalStorage(['keys', 'extensionID']);

    if (isStorageValid(storage)) {
      return true;
    }

    await generateDefaultStorage(browserInfo);

    return true;
  } catch (err) {
    storeLog('error', 29, err, 'verifyStorageIntegrity');

    return false;
  }
};

export default verifyStorageIntegrity;
