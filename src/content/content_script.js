//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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
const browser = require('webextension-polyfill');
const { observe, createObserver } = require('./observer');
const { getTabData, getInputs, addInputListener, portSetup, isInFrame, addFormElementsNumber, getFormElements } = require('./functions');
const contentOnMessage = require('./events/contentOnMessage');
const { loadFromLocalStorage, saveToLocalStorage } = require('../localStorage');
const storeLog = require('../partials/storeLog');

let tabData;
let storage;

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

  try {
    storage = await loadFromLocalStorage([`tabData-${tabData?.id}`]);
  } catch (err) {}

  const storageTabData = storage[`tabData-${tabData?.id}`] ? storage[`tabData-${tabData?.id}`] : {};

  if (!storageTabData?.url || !storageTabData?.urlPath) {
    storageTabData.url = tabData?.url;
    storageTabData.urlPath = tabData?.urlPath;
    storageTabData.timestamp = Date.now();

    await saveToLocalStorage({ [`tabData-${tabData?.id}`]: storageTabData });
    storage = null;
  }

  addInputListener(getInputs(), tabData?.id);
  addFormElementsNumber(getFormElements());

  const mutationObserver = createObserver(tabData);
  observe(mutationObserver);

  const onMessageListener = request => {
    if (request?.action === 'contentScript') {
      if (isInFrame()) {
        return false;
      }
    }

    return contentOnMessage(request, tabData);
  };
  browser.runtime.onMessage.addListener(onMessageListener);

  window.addEventListener('beforeunload', async () => {
    mutationObserver.disconnect();
    browser.runtime.onMessage.removeListener(onMessageListener);
  }, { once: true });
};

contentScriptRun()
  .catch(err => storeLog('error', 33, err, tabData?.url));
