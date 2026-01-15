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

import browser from 'webextension-polyfill';
import config from '@/config.js';
import { notification, inputToken, getTokenInput, loadFonts, isInFrame, getActiveElement, tokenNotification, checkCrossDomain } from '@content/functions';
import storeLog from '@partials/storeLog.js';

/**
 * Handles messages received by the content script.
 * @param {Object} request - The message request object.
 * @param {Object} sender - Information about the message sender.
 * @param {Function} sendResponse - Function to send a response.
 * @param {Object} tabData - The tab data from getTabData.
 * @return {boolean} Always returns true for async response handling.
 */
const contentOnMessage = (request, sender, sendResponse, tabData) => {
  if (!request || !request.action) {
    sendResponse({ status: 'error' });
    return true;
  }

  if (request?.action === 'contentScript' || request?.action === 'notification') {
    if (isInFrame()) {
      sendResponse({ status: 'omitted' });
      return true;
    }
  }

  switch (request.action) {
    case 'inputToken': {
      (async () => {
        let sessionTabData = null;

        try {
          const response = await browser.runtime.sendMessage({ action: 'getSessionTabData' });

          if (response?.status === 'ok' && response?.data) {
            sessionTabData = response.data;
          }
        } catch (err) {
          await storeLog('error', 17, err, 'contentOnMessage getSessionTabData');
          sendResponse({ status: 'error', message: 'Failed to load data' });
          return;
        }

        if (!sessionTabData || !sessionTabData[`tabData-${tabData?.id}`] || sessionTabData[`tabData-${tabData?.id}`]?.requestID !== request.token_request_id) {
          if (isInFrame()) {
            sendResponse({ status: 'omitted' });
            return;
          }

          sendResponse({
            status: 'notification',
            title: config.Texts.Error.OldRequest.Title,
            message: config.Texts.Error.OldRequest.Message
          });
          return;
        }

        const lastFocusedInput = sessionTabData[`tabData-${tabData?.id}`].lastFocusedInput;
        let tokenInput;

        if (lastFocusedInput) {
          tokenInput = getTokenInput(lastFocusedInput);
        }

        if (!tokenInput) {
          if (isInFrame()) {
            sendResponse({ status: 'omitted' });
            return;
          }

          if (!lastFocusedInput) {
            tokenNotification(request.token);
          }

          sendResponse({ status: 'ok' });
          return;
        }

        const crossDomainCheck = checkCrossDomain();

        if (crossDomainCheck.isCrossDomain) {
          const confirmMessage = config.Texts.Warning.CrossDomain(
            crossDomainCheck.currentHostname,
            crossDomainCheck.topHostname
          );

          const userConfirmed = window.confirm(confirmMessage);

          if (!userConfirmed) {
            sendResponse({ status: 'cancelled' });
            return;
          }
        }

        sendResponse(inputToken(request, tokenInput, tabData?.url));

        sessionTabData = null;
      })();

      break;
    }

    case 'getActiveElement': {
      const activeElementResponse = getActiveElement();
      sendResponse(activeElementResponse);
      break;
    }

    case 'pageLoadComplete': {
      sendResponse({ status: 'ok' });
      break;
    }

    case 'notification': {
      loadFonts();
      notification(request);
      sendResponse({ status: 'ok' });
      break;
    }

    case 'contentScript': {
      sendResponse({ status: 'ok' });
      break;
    }

    case 'showTokenNotification': {
      if (isInFrame()) {
        sendResponse({ status: 'omitted' });
        break;
      }

      loadFonts();
      tokenNotification(request.token);
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
