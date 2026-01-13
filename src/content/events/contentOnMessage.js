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

import config from '@/config.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import { notification, inputToken, getTokenInput, showNotificationInfo, loadFonts, isInFrame, getActiveElement, tokenNotification } from '@content/functions';
import storeLog from '@partials/storeLog.js';

const contentOnMessage = (request, sender, sendResponse, tabData) => {
  if (!request || !request.action) {
    sendResponse({ status: 'error' });
    return true;
  }

  if (request?.action === 'contentScript' || request?.action === 'notification' || request?.action === 'notificationInfo') {
    if (isInFrame()) {
      sendResponse({ status: 'omitted' });
      return true;
    }
  }

  switch (request.action) {
    case 'inputToken': {
      (async () => {
        let storage;

        try {
          storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
        } catch (err) {
          await storeLog('error', 17, err, 'contentOnMessage loadFromLocalStorage');
          sendResponse({ status: 'error', message: 'Failed to load data' });
        }
  
        if (!storage || !storage[`tabData-${tabData?.id}`] || storage[`tabData-${tabData?.id}`]?.requestID !== request.token_request_id) {
          if (isInFrame()) {
            sendResponse({ status: 'omitted' });
          }
  
          sendResponse({
            status: 'notification',
            title: config.Texts.Error.OldRequest.Title,
            message: config.Texts.Error.OldRequest.Message
          });
          return true;
        }
  
        const lastFocusedInput = storage[`tabData-${tabData?.id}`].lastFocusedInput;
        let tokenInput;
  
        if (lastFocusedInput) {
          tokenInput = getTokenInput(lastFocusedInput);
        }
        
        if (!lastFocusedInput || !tokenInput) {
          if (!isInFrame()) {
            tokenNotification(request.token);
          }

          sendResponse({ status: 'ok' });
        } else {
          sendResponse(inputToken(request, tokenInput, tabData?.url));
        }
      })();

      break;
    }

    case 'getActiveElement': {
      const activeElementResponse = getActiveElement();
      sendResponse(activeElementResponse);
      break;
    }

    case 'pageLoadComplete': {
      sendResponse({ status: 'ok' }); // Possibly for future use
      break;
    }

    case 'notification':
    case 'notificationInfo': {
      loadFonts();

      if (request.action === 'notification') {
        notification(request);
        sendResponse({ status: 'ok' });
      } else if (request.action === 'notificationInfo') {
        showNotificationInfo();
        sendResponse({ status: 'ok' });
      }

      break;
    }

    case 'contentScript': {
      sendResponse({ status: 'ok' });
      break;
    }

    default: {
      sendResponse({ status: 'error' });
      break;
    }
  }

  return true;
};

export default contentOnMessage;
