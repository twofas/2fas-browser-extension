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
import { getTabData, portSetup, isInFrame } from '@content/functions';
import contentOnMessage from '@content/events/contentOnMessage.js';
import storeLog from '@partials/storeLog.js';

let tabData = null;
let isTopFrame = false;
let onMessageListener = null;

const LISTENER_KEY = '__2fasMessageListener';

/**
 * Main content script initialization function.
 * @async
 * @return {Promise<boolean|void>}
 */
const contentScriptRun = async () => {
  portSetup();

  isTopFrame = !isInFrame();

  if (!browser?.runtime?.id) {
    return false;
  }

  if (window[LISTENER_KEY]) {
    try {
      browser.runtime.onMessage.removeListener(window[LISTENER_KEY]);
    } catch (e) {}

    window[LISTENER_KEY] = null;
  }

  try {
    tabData = await getTabData();
  } catch (e) {
    throw new Error(e);
  }

  onMessageListener = (request, sender, sendResponse) => {
    if (!browser?.runtime?.id) {
      browser.runtime.onMessage.removeListener(onMessageListener);
      window[LISTENER_KEY] = null;
      return;
    }

    return contentOnMessage(request, sender, sendResponse, tabData, isTopFrame);
  };

  browser.runtime.onMessage.addListener(onMessageListener);
  window[LISTENER_KEY] = onMessageListener;

  window.addEventListener('beforeunload', () => {
    if (onMessageListener) {
      browser.runtime.onMessage.removeListener(onMessageListener);
    }

    tabData = null;
    isTopFrame = false;
    onMessageListener = null;
    window[LISTENER_KEY] = null;
  }, { once: true });
};

contentScriptRun()
  .catch(err => storeLog('error', 33, err, tabData?.url));
