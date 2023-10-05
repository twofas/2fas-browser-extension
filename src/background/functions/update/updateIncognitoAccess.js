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
const { loadFromLocalStorage, saveToLocalStorage } = require('../../../localStorage');
const storeLog = require('../../../partials/storeLog');
const checkTabCS = require('../checkTabCS');

const updateIncognitoAccess = async () => {
  let storage = null;
  let incognitoAllowed = await browser.extension.isAllowedIncognitoAccess();

  try {
    storage = await loadFromLocalStorage(['incognito']);
  } catch (err) {
    return storeLog('error', 26, err, 'updateIncognitoAccess');
  }

  if (storage.incognito !== incognitoAllowed) {
    return saveToLocalStorage({ incognito: incognitoAllowed }, storage)
      .then(() => {
        storage = null;
        incognitoAllowed = null;
      })
      .then(() => browser.tabs.query({ active: true }))
      .then(tabs => tabs.map(tab => checkTabCS(tab.id)))
      .catch(err => storeLog('error', 26, err, 'updateIncognitoAccess'));
  }
};

module.exports = updateIncognitoAccess;
