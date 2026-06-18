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
import { onConnect, onCommand, onInstalled, onMessage, onStartup } from '@background/events/index.js';
import { createContextMenus, onContextMenuClick } from '@background/contextMenu/index.js';
import { browserAction, dummyGetLocalStorage, setIcon } from '@background/functions/index.js';
import { flushBrowserRegistration, REGISTRATION_ALARM_NAME } from '@background/functions/update/index.js';
import { onTabRemoved, onTabUpdated, onTabActivated } from '@background/tabs/index.js';

createContextMenus();

browser.runtime.onInstalled.addListener(onInstalled);
browser.runtime.onMessage.addListener(onMessage);
browser.runtime.onStartup.addListener(onStartup);
browser.runtime.onConnect.addListener(onConnect);

browser.action.onClicked.addListener(browserAction);

browser.commands.onCommand.addListener(onCommand);
browser.contextMenus.onClicked.addListener(onContextMenuClick);

browser.tabs.onRemoved.addListener(onTabRemoved);
browser.tabs.onUpdated.addListener(onTabUpdated);
browser.tabs.onActivated.addListener(onTabActivated);

// Durable browser-extension registration retry: an alarm wakes a terminated service
// worker when a delivery is due, and the 'online' event recovers the moment
// connectivity returns (captive portal / VPN / wake-from-sleep).
if (browser.alarms?.onAlarm) {
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm?.name === REGISTRATION_ALARM_NAME) {
      flushBrowserRegistration();
    }
  });
}

self.addEventListener('online', () => flushBrowserRegistration());

setInterval(() => {
  flushBrowserRegistration({ force: false });
  return dummyGetLocalStorage();
}, 25 * 1000);

setIcon(null, false, false);
