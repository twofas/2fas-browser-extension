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

const config = require('../../config');
const loadFromLocalStorage = require('../../localStorage/loadFromLocalStorage');
const { notification, inputToken, getTokenInput, showNotificationInfo, loadFonts, isInFrame } = require('../functions');
const storeLog = require('../../partials/storeLog');

const contentOnMessage = async (request, tabData) => {
  if (!request || !request.action) {
    return { status: 'error' };
  }

  switch (request.action) {
    case 'inputToken': {
      let storage;

      try {
        storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
      } catch (err) {
        return storeLog('error', 17, err, 'contentOnMessage loadFromLocalStorage');
      }

      if (!storage || !storage[`tabData-${tabData?.id}`] || storage[`tabData-${tabData?.id}`].requestID !== request.token_request_id) {
        if (isInFrame()) {
          return false;
        }

        return {
          status: 'notification',
          title: config.Texts.Error.UndefinedError.Title,
          message: config.Texts.Error.UndefinedError.Message
        };
      }

      const lastFocusedInput = storage[`tabData-${tabData?.id}`].lastFocusedInput;
      let tokenInput;

      if (lastFocusedInput) {
        tokenInput = getTokenInput(lastFocusedInput);
      }
      
      if (!lastFocusedInput || !tokenInput) {
        return notification({
          title: 'Your token',
          message: request.token
        }); // @TODO: change to proper notification later
      } else {
        return inputToken(request, tokenInput, tabData?.url);
      }
    }

    case 'checkActiveElement': {
      // const activeElement = document.activeElement;

      return { status: 'todo' };
    }

    case 'pageLoadComplete': {
      return { status: 'ok' }; // Possibly for future use
    }

    case 'notification':
    case 'notificationInfo': {
      loadFonts();

      if (request.action === 'notification') {
        return notification(request);
      } else if (request.action === 'notificationInfo') {
        return showNotificationInfo();
      }

      break;
    }

    case 'contentScript': {
      return { status: 'ok' };
    }

    default: {
      return { status: 'error' };
    }
  }
};

module.exports = contentOnMessage;
