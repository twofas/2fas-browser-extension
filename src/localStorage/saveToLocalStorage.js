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

import browser from 'webextension-polyfill';

/**
 * Saves data to browser local storage and merges it with an optional storage object.
 * @param {Object} data - The data to save to storage
 * @param {Object} [storageObj={}] - Optional object to merge the saved data into
 * @returns {Promise<Object>} Promise resolving to the merged storage object
 */
const saveToLocalStorage = (data, storageObj = {}) => {
  return browser.storage.local.set(data)
    .then(() => Object.assign(storageObj, data))
    .catch(err => {
      console.error({ err });
      throw new Error(err);
    });
};

export default saveToLocalStorage;
