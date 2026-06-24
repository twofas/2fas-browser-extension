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
import { notification, inputToken, getTokenInput, loadFonts, isInFrame, getActiveElement, tokenNotification, checkCrossDomain, resumePendingSubmit } from '@content/functions';
import storeLog from '@partials/storeLog.js';

/**
 * Handles messages received by the content script.
 * @param {Object} request - The message request object.
 * @param {Object} sender - Information about the message sender.
 * @param {Function} sendResponse - Function to send a response.
 * @param {Object} tabData - The tab data from getTabData.
 * @param {boolean} isTopFrame - Whether this content script is running in the top frame.
 * @return {boolean} Always returns true for async response handling.
 */
const contentOnMessage = (request, sender, sendResponse, tabData, isTopFrame) => {
  if (!request || !request.action) {
    sendResponse({ status: 'error' });
    return true;
  }

  if (
    request?.action === 'contentScript' ||
    request?.action === 'notification' ||
    request?.action === 'showTokenNotification'
  ) {
    if (!isTopFrame) {
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

        const tabRecord = sessionTabData?.[`tabData-${tabData?.id}`];
        const hasTabContext = Boolean(tabData?.id) && Boolean(sessionTabData);
        const isValidRequest = hasTabContext && tabRecord?.requestID === request.token_request_id;

        if (!isValidRequest) {
          if (isInFrame()) {
            sendResponse({ status: 'omitted' });
            return;
          }

          // Missing tab context (e.g. getTabData failed transiently) is not a genuinely
          // outdated request — tell the user to refresh instead of showing "OldRequest".
          const errorText = hasTabContext ? config.Texts.Error.OldRequest : config.Texts.Error.General;

          sendResponse({
            status: 'notification',
            title: errorText.Title,
            message: errorText.Message
          });
          return;
        }

        const lastFocusedInput = sessionTabData[`tabData-${tabData?.id}`].lastFocusedInput;
        let tokenInput;

        if (lastFocusedInput) {
          tokenInput = getTokenInput(lastFocusedInput);

          if (tokenInput) {
            tokenInput.removeAttribute('data-twofas-input');
          }
        }

        if (!tokenInput) {
          if (isInFrame()) {
            sendResponse({ status: 'omitted' });
            return;
          }

          if (!lastFocusedInput) {
            tokenNotification(request.token, request.token_request_id);
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

        sendResponse(await inputToken(request, tokenInput, tabData?.url));

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
      // The page finished loading after a token was filled mid-load: replay the
      // auto-submit that inputToken deferred (U5 deferred auto-submit).
      resumePendingSubmit();
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
      loadFonts();
      tokenNotification(request.token, request.token_request_id);
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
