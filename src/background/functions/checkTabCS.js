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
import setIcon from '@background/functions/setIcon.js';
import dummyGetLocalStorage from '@background/functions/dummyGetLocalStorage.js';
import wait from '@partials/wait.js';

/**
 * Checks if content script is active in a tab and updates the extension icon accordingly.
 * @param {number} tabId - The ID of the tab to check.
 * @returns {Promise<void>}
 */
const checkTabCS = async tabId => {
  if (!tabId) {
    return;
  }

  await wait(100);
  await dummyGetLocalStorage();

  let tabInfo;

  try {
    tabInfo = await browser.tabs.get(tabId);
  } catch {
    return;
  }

  const tabUrl = tabInfo?.url ?? tabInfo?.pendingUrl ?? '';
  const extUrl = browser.runtime.getURL('');

  if (tabUrl.includes(extUrl)) {
    await setIcon(tabId, false, false);
    return;
  }

  let urlObj;

  try {
    urlObj = new URL(tabUrl);
  } catch {
    await setIcon(tabId, false, false);
    return;
  }

  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    await setIcon(tabId, false, false);
    return;
  }

  try {
    await browser.tabs.sendMessage(tabId, { action: 'contentScript' });
    await setIcon(tabId);
  } catch {
    await setIcon(tabId, false, true);
  }
};

export default checkTabCS;
