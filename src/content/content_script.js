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

import './styles/content_script.scss';
import browser from 'webextension-polyfill';
import { getTabData, portSetup } from '@content/functions';
import contentOnMessage from '@content/events/contentOnMessage.js';
import storeLog from '@partials/storeLog.js';

let tabData = null;

/**
 * Main content script initialization function.
 * @async
 * @return {Promise<boolean|void>}
 */
const contentScriptRun = async () => {
  portSetup();

  if (!browser?.runtime?.id) {
    return false;
  }

  try {
    tabData = await getTabData();
  } catch (e) {
    throw new Error(e);
  }

  const onMessageListener = (request, sender, sendResponse) => contentOnMessage(request, sender, sendResponse, tabData);
  browser.runtime.onMessage.addListener(onMessageListener);

  window.addEventListener('beforeunload', () => {
    browser.runtime.onMessage.removeListener(onMessageListener);
    tabData = null;
  }, { once: true });
};

contentScriptRun()
  .catch(err => storeLog('error', 33, err, tabData?.url));
