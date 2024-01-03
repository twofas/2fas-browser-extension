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

const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const storeLog = require('../../partials/storeLog');

const pageLoadComplete = async tabID => {
  let storage;
  const activeElement = document?.activeElement;

  if (!activeElement) {
    return false;
  }

  const twofasInput = activeElement.getAttribute('data-twofas-input');

  if (!twofasInput) {
    return false;
  }

  try {
    storage = await loadFromLocalStorage([`tabData-${tabID}`, 'extensionID']);
  } catch (err) {
    await storeLog('error', 43, err, storage[`tabData-${tabID}`]?.url);
  }

  storage[`tabData-${tabID}`].lastFocusedInput = twofasInput;

  return saveToLocalStorage({ [`tabData-${tabID}`]: storage[`tabData-${tabID}`] })
    .catch(err => storeLog('error', 44, err, storage[`tabData-${tabID}`]?.url));
};

module.exports = pageLoadComplete;
