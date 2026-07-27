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
import shouldInvalidateTabRequest from '@background/functions/shouldInvalidateTabRequest.js';

/**
 * Handles tab update events.
 * @async
 * @param {number} tabID - The tab ID.
 * @param {Object} changeInfo - Information about the tab change.
 * @param {Object} [tab] - The updated tab object (provided by the onUpdated listener).
 * @return {Promise<boolean|void>}
 */
const onTabUpdated = async (tabID, changeInfo, tab) => {
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
    // `sessionData` is always null here (the load above threw), so the tab's
    // stored URL is unreachable. Fall back to the navigation URL from the event
    // itself, which is the only URL context available at this point.
    await storeLog('error', 3, err, changeInfo?.url || tab?.url);
    storage = null;
    sessionData = null;
    return false;
  }

  const tabData = sessionData?.[`tabData-${tabID}`];
  const currentURL = changeInfo?.url || tab?.url || null;

  // An in-flight request must survive same-origin "complete" events (the login
  // page finishing load, in-page redirects, reloads, …). Only a genuine
  // navigation to a different origin invalidates it (B3).
  if (tabData?.requestID && shouldInvalidateTabRequest(tabData, currentURL, Date.now())) {
    await new SDK().close2FARequest(storage.extensionID, tabData.requestID, false);

    try {
      await saveToSessionStorage({ [`tabData-${tabID}`]: {} });
    } catch (err) {
      await storeLog('error', 3, err, tabData?.origin);
    }
  } else if (tabData && !tabData?.requestID) {
    // No request in flight: reset any stale tab data on a real page load.
    try {
      await saveToSessionStorage({ [`tabData-${tabID}`]: {} });
    } catch (err) {
      await storeLog('error', 3, err, tabData?.origin);
    }
  }

  storage = null;
  sessionData = null;

  return browser.tabs.sendMessage(tabID, { action: 'pageLoadComplete' })
    .catch(() => {});
};

export default onTabUpdated;
