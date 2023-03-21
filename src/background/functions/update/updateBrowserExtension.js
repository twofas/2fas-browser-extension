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

const config = require('../../../config');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../../localStorage');
const SDK = require('../../../sdk');
const storeLog = require('../../../partials/storeLog');

const updateBrowserExtension = async browserInfo => {
  let data;

  try {
    data = await loadFromLocalStorage(['extensionID', 'extensionVersion', 'browserInfo']);
  } catch (err) {
    return storeLog('error', 27, err, 'updateBrowserExtension');
  }

  if (
    data?.extensionVersion !== config.ExtensionVersion ||
    !data?.browserInfo ||
    data?.browserInfo?.browser_version !== browserInfo.browser_version ||
    data?.browserInfo?.name !== browserInfo.name
  ) {
    let bI = browserInfo;
    bI.name = data?.browserInfo?.name || bI.name;

    return new SDK().updateBrowserExtension(data.extensionID, bI)
      .then(() => saveToLocalStorage({ browserInfo: bI, extensionVersion: config.ExtensionVersion }))
      .then(() => {
        data = null;
        bI = null;
      })
      .catch(err => storeLog('error', 27, err, 'updateBrowserExtension'));
  }

  data = null;
};

module.exports = updateBrowserExtension;
