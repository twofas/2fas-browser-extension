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

/* global URL */
const getBrowserInfo = require('./getBrowserInfo');
const generateDefaultStorage = require('./generateDefaultStorage');
const storeLog = require('../../partials/storeLog');

const onMessage = (request, sender) => {
  return new Promise(resolve => {
    switch (request.action) {
      case 'getTabData': {
        if (!sender?.tab?.id) {
          return resolve({ status: 'No tabID' });
        }

        const url = sender?.tab?.url || sender.url;
        let urlPath;

        try {
          urlPath = new URL(url);
          urlPath = `${urlPath.protocol}//${urlPath.host}${urlPath.pathname}`;
        } catch (err) {
          urlPath = url;
        }

        return resolve({
          id: sender?.tab?.id,
          url: sender?.tab?.url,
          urlPath,
          status: sender?.tab?.status
        });
      }

      case 'storageReset': {
        const browserInfo = getBrowserInfo();

        return generateDefaultStorage(browserInfo)
          .then(() => resolve(true))
          .catch(async err => await storeLog('error', 37, err, 'storageReset'));
      }

      default: {
        return resolve({ status: 'Empty action' });
      }
    }
  });
};

module.exports = onMessage;
