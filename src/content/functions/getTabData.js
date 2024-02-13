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
const storeLog = require('../../partials/storeLog');
const delay = require('../../partials/delay');

const getTabData = () => {
  return browser.runtime.sendMessage({ action: 'getTabData' })
    .catch(err => {
      if (err && typeof err?.toString === 'function') {
        if (err.toString() === 'Error: Could not establish connection. Receiving end does not exist.') {
          return delay(() => browser.runtime.sendMessage({ action: 'getTabData' }).catch(err => storeLog('error', 14, err, 'getTabData - second try')), 100);
        }

        return storeLog('error', 14, err, 'getTabData - toString');
      }

      return storeLog('error', 14, err, 'getTabData - no error');
    });
};

module.exports = getTabData;
