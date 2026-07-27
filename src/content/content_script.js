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
import { getTabData, isInFrame } from '@content/functions';
import contentOnMessage from '@content/events/contentOnMessage.js';

let tabData = null;
let tabDataPromise = null;
let isTopFrame = false;
let onMessageListener = null;

const LISTENER_KEY = '__2fasMessageListener';

const ensureTabData = () => {
  if (tabData) {
    return Promise.resolve(tabData);
  }

  if (!tabDataPromise) {
    tabDataPromise = getTabData()
      .then(data => { tabData = data; return data; })
      .catch(() => null)
      .finally(() => { tabDataPromise = null; });
  }

  return tabDataPromise;
};

const contentScriptRun = () => {
  if (!browser?.runtime?.id) {
    return;
  }

  isTopFrame = !isInFrame();

  if (window[LISTENER_KEY]) {
    try {
      browser.runtime.onMessage.removeListener(window[LISTENER_KEY]);
    } catch (e) {}

    window[LISTENER_KEY] = null;
  }

  onMessageListener = (request, sender, sendResponse) => {
    if (!browser?.runtime?.id) {
      try {
        browser.runtime.onMessage.removeListener(onMessageListener);
      } catch (e) {}

      window[LISTENER_KEY] = null;
      return;
    }

    if (!tabData && request?.action === 'inputToken') {
      ensureTabData().finally(() => {
        contentOnMessage(request, sender, sendResponse, tabData, isTopFrame);
      });
      return true;
    }

    return contentOnMessage(request, sender, sendResponse, tabData, isTopFrame);
  };

  browser.runtime.onMessage.addListener(onMessageListener);
  window[LISTENER_KEY] = onMessageListener;

  window.addEventListener('beforeunload', () => {
    if (onMessageListener) {
      try {
        browser.runtime.onMessage.removeListener(onMessageListener);
      } catch (e) {}
    }

    tabData = null;
    tabDataPromise = null;
    isTopFrame = false;
    onMessageListener = null;
    window[LISTENER_KEY] = null;
  }, { once: true });

  ensureTabData();
};

contentScriptRun();
