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
const { onConnect, onCommand, onContextMenuClick, onInstalled, getBrowserInfo, onMessage, onStartup, browserAction, createContextMenus, dummyGetLocalStorage, setIcon } = require('./functions');
const { onTabRemoved, onTabUpdated, onTabActivated } = require('./tabs');

const browserInfo = getBrowserInfo();
if (process.env.EXT_PLATFORM === 'Firefox') {
  createContextMenus();
}

browser.runtime.onInstalled.addListener(details => onInstalled(details, browserInfo));
browser.runtime.onMessage.addListener(onMessage);
browser.runtime.onStartup.addListener(onStartup);
browser.runtime.onConnect.addListener(onConnect);

if (process.env.EXT_PLATFORM === 'Firefox') {
  browser.browserAction.onClicked.addListener(browserAction);
} else {
  browser.action.onClicked.addListener(browserAction);
}

browser.commands.onCommand.addListener(onCommand);
browser.contextMenus.onClicked.addListener(onContextMenuClick);

browser.tabs.onRemoved.addListener(onTabRemoved);
browser.tabs.onUpdated.addListener(onTabUpdated);
browser.tabs.onActivated.addListener(onTabActivated);

setInterval(() => {
  return dummyGetLocalStorage();
}, 25 * 1000);

setIcon(null, false, false);
