//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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

const browser = require('webextension-polyfill');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const storeLog = require('../../partials/storeLog');
const { v4: uuidv4 } = require('uuid');

const inputFocus = async (event, tabID) => {
  if (!browser?.runtime?.id || !event || !event?.target) {
    return false;
  }

  let storage;
  const el = event.target;

  try {
    storage = await loadFromLocalStorage([`tabData-${tabID}`]);
  } catch (err) {
    return storeLog('error', 16, err, 'inputFocus - no URL/tabID');
  }

  try {
    const tabData = storage[`tabData-${tabID}`] ? storage[`tabData-${tabID}`] : {};

    if (
      el?.dataset?.twofasInput?.length > 0 &&
      (typeof el?.dataset?.twofasInput === 'string' || el?.dataset?.twofasInput instanceof String)
    ) {
      tabData.lastFocusedInput = el.dataset.twofasInput;
    } else {
      if (typeof el?.setAttribute === 'function') {
        const inputUUID = uuidv4();
        el.setAttribute('data-twofas-input', inputUUID);
        tabData.lastFocusedInput = inputUUID;
      }
    }

    return saveToLocalStorage({ [`tabData-${tabID}`]: tabData }, storage);
  } catch (err) {
    return storeLog('error', 16, err, storage[`tabData-${tabID}`]?.url);
  }
};

module.exports = inputFocus;
