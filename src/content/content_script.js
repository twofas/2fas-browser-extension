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
const LIFECYCLE_KEY = '__2fasLifecycleHandlers';

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

  const registerOnMessageListener = () => {
    if (window[LISTENER_KEY] || !onMessageListener || !browser?.runtime?.id) {
      return;
    }

    browser.runtime.onMessage.addListener(onMessageListener);
    window[LISTENER_KEY] = onMessageListener;
  };

  const removeOnMessageListener = () => {
    if (!window[LISTENER_KEY]) {
      return;
    }

    try {
      browser.runtime.onMessage.removeListener(window[LISTENER_KEY]);
    } catch (e) {}

    window[LISTENER_KEY] = null;
  };

  // Replace a stale listener and lifecycle handlers from a previous injection
  // of this script, then register the fresh ones — otherwise an old injection's
  // pageshow handler could resurrect its own stale message listener.
  removeOnMessageListener();

  if (window[LIFECYCLE_KEY]) {
    window.removeEventListener('pagehide', window[LIFECYCLE_KEY].pagehide);
    window.removeEventListener('pageshow', window[LIFECYCLE_KEY].pageshow);
  }

  registerOnMessageListener();

  // Detach on pagehide, NOT beforeunload: beforeunload also fires for
  // navigations that never commit (cancelled navigation, a link that becomes a
  // download, "Stay on page") where the document stays alive and no pageshow
  // ever follows — removing there would leave the tab permanently deaf to token
  // delivery (log 58). pagehide fires only when the document really unloads or
  // enters the back/forward cache, and the bfcache case is undone by pageshow.
  const onPagehide = () => {
    removeOnMessageListener();
    tabData = null;
    tabDataPromise = null;
  };

  // Content scripts are NOT re-executed when a document is restored from the
  // back/forward cache — pageshow is the only signal to re-attach the listener
  // removed at pagehide. Idempotent on the initial load.
  const onPageshow = () => {
    registerOnMessageListener();
    ensureTabData();
  };

  window.addEventListener('pagehide', onPagehide);
  window.addEventListener('pageshow', onPageshow);
  window[LIFECYCLE_KEY] = { pagehide: onPagehide, pageshow: onPageshow };

  ensureTabData();
};

contentScriptRun();
