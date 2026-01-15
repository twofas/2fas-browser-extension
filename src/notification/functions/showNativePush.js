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

/**
 * Displays a native browser notification with optional sound alert.
 *
 * @param {Object} notificationObject - Object containing Title and Message properties
 * @param {boolean} alert - Whether to play a sound with the notification
 * @returns {Promise<string>} A promise that resolves to the notification ID
 */
const showNativePush = (notificationObject, alert) => {
  const notificationOptions = {
    title: notificationObject.Title,
    message: notificationObject.Message,
    iconUrl: '../images/icons/icon128.png',
    silent: !alert,
    requireInteraction: false,
    type: 'basic',
    priority: alert ? 1 : 0
  };

  if (process.env.EXT_PLATFORM === 'Firefox') {
    delete notificationOptions.silent;
    delete notificationOptions.requireInteraction;
  }

  return browser.notifications.create('', notificationOptions);
};

export default showNativePush;
