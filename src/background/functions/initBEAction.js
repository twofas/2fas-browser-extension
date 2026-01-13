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
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';
import subscribeChannel from '@background/functions/subscribeChannel.js';
import TwoFasNotification from '@notification/index.js';
import SDK from '@sdk/index.js';
import storeLog from '@partials/storeLog.js';
import sendMessageToAllFrames from '@background/functions/sendMessageToAllFrames.js';
import handleFrontElement from '@background/functions/handleFrontElement.js';

/**
 * Initiates browser extension action for 2FA token request.
 * @async
 * @param {string} url - The URL of the current page.
 * @param {Object} tab - The tab object.
 * @param {Object} storageData - The local storage data containing extensionID.
 * @return {Promise<void>}
 */
const initBEAction = async (url, tab, storageData) => {
  const now = new Date().getTime();
  let storage = storageData;
  let sessionData = null;

  if (!tab?.id) {
    storage = null;
    return TwoFasNotification.show(config.Texts.Error.UndefinedError, null);
  }

  try {
    sessionData = await loadFromSessionStorage([`tabData-${tab.id}`]);
  } catch (err) {
    sessionData = {};
  }

  if (!sessionData[`tabData-${tab.id}`]) {
    sessionData[`tabData-${tab.id}`] = {};
  }

  const tabData = sessionData[`tabData-${tab.id}`];
  let condition = false;
  let diff;

  if (!tabData?.lastAction) {
    condition = true;
  } else {
    diff = (now - tabData.lastAction) / 1000;
    condition = Math.round(diff) >= config.ResendPushTimeout;
  }

  if (condition) {
    tabData.lastAction = now;

    try {
      await saveToSessionStorage({ [`tabData-${tab.id}`]: tabData });

      const requestData = await new SDK().request2FAToken(storage.extensionID, url);
      tabData.requestID = requestData.token_request_id;

      await saveToSessionStorage({ [`tabData-${tab.id}`]: tabData });

      const channel = await subscribeChannel(storage, tab.id, {
        action: true,
        timeout: true,
        login: true,
        requestID: tabData.requestID,
        notifications: {
          timeout: config.Texts.Error.PushExpired(url),
          error: config.Texts.Error.General
        }
      });

      channel.connect();

      const elements = await sendMessageToAllFrames(tab.id, { action: 'getActiveElement' });
      await handleFrontElement(elements, tab.id, sessionData);
    } catch (err) {
      await storeLog('error', 5, err, tabData.url);
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, tab.id);
    } finally {
      storage = null;
      sessionData = null;
    }
  } else {
    storage = null;
    sessionData = null;

    if (diff > 1) {
      return TwoFasNotification.show(config.Texts.Warning.TooSoon(diff), tab.id);
    }
  }
};

export default initBEAction;
