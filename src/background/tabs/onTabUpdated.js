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
import { loadFromLocalStorage } from '@localStorage/index.js';
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';
import storeLog from '@partials/storeLog.js';
import SDK from '@sdk/index.js';
import checkTabCS from '@background/functions/checkTabCS.js';

/**
 * Handles tab update events.
 * @async
 * @param {number} tabID - The tab ID.
 * @param {Object} changeInfo - Information about the tab change.
 * @return {Promise<boolean|void>}
 */
const onTabUpdated = async (tabID, changeInfo) => {
  if (!changeInfo) {
    return false;
  }

  if (tabID && (changeInfo?.status === 'complete' || changeInfo?.favIconUrl || changeInfo?.isArticle)) {
    await checkTabCS(tabID);
  }

  if (changeInfo?.status !== 'complete') {
    return false;
  }

  let storage = null;
  let sessionData = null;

  try {
    storage = await loadFromLocalStorage(['extensionID']);
    sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
  } catch (err) {
    await storeLog('error', 3, err, sessionData?.[`tabData-${tabID}`]?.url);
    storage = null;
    sessionData = null;
    return false;
  }

  if (sessionData?.[`tabData-${tabID}`]?.requestID) {
    await new SDK().close2FARequest(storage.extensionID, sessionData[`tabData-${tabID}`].requestID, false);
  }

  if (sessionData?.[`tabData-${tabID}`]) {
    try {
      await saveToSessionStorage({ [`tabData-${tabID}`]: {} });
    } catch (err) {
      await storeLog('error', 3, err, sessionData[`tabData-${tabID}`]?.url);
    }
  }

  storage = null;
  sessionData = null;

  return browser.tabs.sendMessage(tabID, { action: 'pageLoadComplete' })
    .catch(() => {});
};

export default onTabUpdated;
