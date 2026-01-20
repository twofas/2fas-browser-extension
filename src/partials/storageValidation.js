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

import config from '../config.js';
import TwoFasNotification from '../notification/index.js';
import saveToLocalStorage from '../localStorage/saveToLocalStorage.js';

/**
 * Checks if storage is completely empty (no meaningful data)
 * @param {Object} storage - Storage object to check
 * @returns {boolean} True if storage is empty or contains only attempt counter
 */
const isStorageEmpty = storage => {
  if (!storage || typeof storage !== 'object') {
    return true;
  }

  const storageKeys = Object.keys(storage);

  if (storageKeys.length === 0) {
    return true;
  }

  if (storageKeys.length === 1 && storageKeys[0] === 'attempt') {
    return true;
  }

  return false;
};

/**
 * Validates that storage contains required keys and extension ID
 * @param {Object} storage - Storage object to validate
 * @returns {Promise<void>} Resolves if valid, rejects with TypeError if invalid
 */
const storageValidation = async storage => {
  const hasValidKeys = storage?.keys?.publicKey && storage?.keys?.privateKey;
  const hasExtensionID = Boolean(storage?.extensionID);

  if (!hasValidKeys || !hasExtensionID) {
    if (storage?.attempt > 5) {
      TwoFasNotification.show(config.Texts.Error.StorageIntegrity);
      throw new TypeError('Too many attempts');
    }

    if (!isStorageEmpty(storage)) {
      TwoFasNotification.show(config.Texts.Error.StorageCorrupted);
    }

    throw new TypeError('Storage corrupted');
  }

  if (storage?.attempt > 0) {
    await saveToLocalStorage({ attempt: 0 });
  }
};

export default storageValidation;
