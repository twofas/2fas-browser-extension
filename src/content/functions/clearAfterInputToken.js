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

import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage';

/**
 * Clears the 2FAS data attribute from the input element and removes stored input reference.
 *
 * @param {HTMLElement} inputElement - The input element to clear
 * @param {number} tabID - The browser tab ID
 * @returns {Promise<boolean|void>} Promise that resolves when cleanup is complete
 */
const clearAfterInputToken = (inputElement, tabID) => {
  // CLEAR INPUT
  if (inputElement) {
    if (typeof inputElement?.removeAttribute === 'function') {
      inputElement.removeAttribute('data-twofas-input');
    }
  }

  // CLEAR STORAGE
  return loadFromLocalStorage([`tabData-${tabID}`])
    .then(storage => {
      if (storage[`tabData-${tabID}`] && storage[`tabData-${tabID}`].lastFocusedInput) {
        delete storage[`tabData-${tabID}`].lastFocusedInput;
        return saveToLocalStorage({ [`tabData-${tabID}`]: storage[`tabData-${tabID}`] });
      }

      return true;
    })
    .catch(() => {});
};

export default clearAfterInputToken;
