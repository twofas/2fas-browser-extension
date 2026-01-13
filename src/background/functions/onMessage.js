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
import getBrowserInfo from '@background/functions/getBrowserInfo.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';

const onMessage = (request, sender, sendResponse) => {
  if (!request || !request.action) {
    sendResponse({ status: 'error' });
    return true;
  }

  switch (request.action) {
    case 'getTabData': {
      if (!sender?.tab?.id) {
        sendResponse({ status: 'No tabID' });
        return true;
      }

      const url = sender?.tab?.url || sender.url;
      let urlPath;

      try {
        urlPath = new URL(url);
        urlPath = `${urlPath.protocol}//${urlPath.host}${urlPath.pathname}`;
      } catch (err) {
        urlPath = url;
      }

      sendResponse({
        id: sender?.tab?.id,
        url: sender?.tab?.url,
        urlPath,
        status: sender?.tab?.status
      });

      break;
    }

    case 'storageReset': {
      const browserInfo = getBrowserInfo();

      try {
        generateDefaultStorage(browserInfo).then(() => {
          sendResponse({ status: 'ok' });
        });
      } catch (err) {
        storeLog('error', 37, err, 'storageReset').then(() => {
          sendResponse({ status: 'error' });
        });
      }

      break;
    }

    case 'notificationOnBackground': {
      if (!request?.data) {
        sendResponse({ status: 'No data' });
      }

      TwoFasNotification.show(request.data, request.tabID).then(() => {
        sendResponse({ status: 'ok' });
      });

      break;
    }

    default: {
      sendResponse({ status: 'Empty action' });
      break;
    }
  }

  return true;
};

export default onMessage;
