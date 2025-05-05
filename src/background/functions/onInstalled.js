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

const openInstallPage = require('./openInstallPage');
const storeLog = require('../../partials/storeLog');
const updateBrowserInfo = require('./updateBrowserInfo');
const createContextMenus = require('./createContextMenus');
const generateDefaultStorage = require('./generateDefaultStorage');
const checkSafariStorage = require('./checkSafariStorage');

const onInstalled = (details, browserInfo) => {
  if (process.env.EXT_PLATFORM !== 'Firefox') {
    createContextMenus();
  }

  if (details?.reason !== 'install') {
    return updateBrowserInfo(browserInfo);
  }

  if (process.env.EXT_PLATFORM === 'Safari') {
    return checkSafariStorage(browserInfo);
  }

  return generateDefaultStorage(browserInfo)
    .then(() => openInstallPage())
    .catch(err => storeLog('error', 9, err, 'onInstalled'));
};

module.exports = onInstalled;
