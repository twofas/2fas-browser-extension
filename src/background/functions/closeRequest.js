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

const SDK = require('../../sdk');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const storeLog = require('../../partials/storeLog');

const closeRequest = async (tabID, requestID) => {
  let storage;

  try {
    storage = await loadFromLocalStorage([`tabData-${tabID}`, 'extensionID']);
  } catch (err) {
    return storeLog('error', 30, err);
  }

  if (!storage || !storage[`tabData-${tabID}`].requestID || requestID !== storage[`tabData-${tabID}`].requestID) {
    return false;
  }

  return new SDK().close2FARequest(storage.extensionID, storage[`tabData-${tabID}`].requestID, true)
    .then(() => {
      const tabObject = structuredClone(storage[`tabData-${tabID}`]);
      delete tabObject.requestID;

      return saveToLocalStorage({ [`tabData-${tabID}`]: tabObject });
    })
    .then(() => { storage = null; })
    .catch(err => storeLog('error', 30, err, storage[`tabData-${tabID}`]?.url));
};

module.exports = closeRequest;
