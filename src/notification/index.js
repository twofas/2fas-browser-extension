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

const { sendFrontEndPushAction, showFrontEndPush, showNativePush, showNativePushWithoutTimeout } = require('./functions');
const loadFromLocalStorage = require('../localStorage/loadFromLocalStorage');
const S = require('../selectors');

class twoFasNotification {
  static show (notificationObject, tabID = null, alert = false) {
    return loadFromLocalStorage(['nativePush'])
      .then(storage => {
        if (storage.nativePush) {
          return showNativePush(notificationObject, alert);
        } else {
          if (tabID) {
            return sendFrontEndPushAction(notificationObject, tabID, true);
          } else {
            return showFrontEndPush(notificationObject, true);
          }
        }
      });
  }

  static showWithoutTimeout (notificationObject, tabID = null) {
    return loadFromLocalStorage(['nativePush'])
      .then(storage => {
        if (storage.nativePush) {
          return showNativePushWithoutTimeout(notificationObject);
        } else {
          if (tabID) {
            return sendFrontEndPushAction(notificationObject, tabID, false);
          } else {
            return showFrontEndPush(notificationObject, false);
          }
        }
      });
  }

  static clearAll () {
    const container = document.querySelector(S.notification.container);
    const notifications = container.querySelectorAll(S.notification.notification);

    if (notifications) {
      return Array.from(notifications).forEach(notification => {
        notification.classList.remove('visible');

        setTimeout(() => {
          notification.classList.add('hidden');
        }, 300);
      });
    }
  }
}

module.exports = twoFasNotification;
