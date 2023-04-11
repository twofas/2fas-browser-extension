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

const browser = require('webextension-polyfill');

const onTabActivated = async ({ tabId }) => {
  const tabInfo = await browser.tabs.get(tabId);
  const tabUrl = tabInfo.url ? tabInfo.url : tabInfo.pendingUrl;
  const extUrl = browser.runtime.getURL('');
  let urlObj;

  if (tabUrl.includes(extUrl)) {
    return;
  }

  try {
    urlObj = new URL(tabUrl);
  } catch (e) {
    return;
  }

  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    return;
  }

  try {
    await browser.tabs.sendMessage(tabId, { action: 'contentScript' });
  } catch (err) {
    if (process.env.EXT_PLATFORM === 'Firefox' || process.env.EXT_PLATFORM === 'Safari') {
      browser.browserAction.setIcon({
        path: {
          16: browser.runtime.getURL('images/icons/icon16gray.png'),
          32: browser.runtime.getURL('images/icons/icon32gray.png'),
          48: browser.runtime.getURL('images/icons/icon48gray.png'),
          96: browser.runtime.getURL('images/icons/icon96gray.png'),
          128: browser.runtime.getURL('images/icons/icon128gray.png')
        },
        tabId
      });
      await browser.browserAction.setTitle({ tabId, title: browser.i18n.getMessage('inActiveTabInfo') });
    } else {
      browser.action.setIcon({
        path: {
          16: browser.runtime.getURL('images/icons/icon16gray.png'),
          32: browser.runtime.getURL('images/icons/icon32gray.png'),
          48: browser.runtime.getURL('images/icons/icon48gray.png'),
          96: browser.runtime.getURL('images/icons/icon96gray.png'),
          128: browser.runtime.getURL('images/icons/icon128gray.png')
        },
        tabId
      });
      await browser.action.setTitle({ tabId, title: browser.i18n.getMessage('inActiveTabInfo') });
    }
  }
};

module.exports = onTabActivated;
