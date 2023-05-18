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

const config = require('../../config');
const browser = require('webextension-polyfill');
const TwoFasNotification = require('../../notification');
const initBEAction = require('./initBEAction');
const saveToLocalStorage = require('../../localStorage/saveToLocalStorage');
const sendNotificationInfo = require('./sendNotificationInfo');
const checkIconTitleText = require('./checkIconTitleText');

const browserActionConfigured = async (tab, data) => {
  const url = new URL(tab?.url);
  const now = new Date().getTime();
  let storage = data;
  let diff, go;

  if (!storage.globalLastAction) {
    go = true;
  } else {
    diff = (now - storage.globalLastAction) / 1000;
    go = Math.round(diff) > 1;
  }

  storage = await saveToLocalStorage({ globalLastAction: now }, storage);

  if (!go) {
    return false;
  }

  go = await checkIconTitleText(tab?.id);

  if (!go) {
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    console.warn(`${url.protocol} ${browser.i18n.getMessage('isNotSupportedByExt')}`);
    TwoFasNotification.show(config.Texts.Info.UnsupportedProtocol, tab?.id);
    go = false;
  }

  if (go) {
    if (!('notifications' in storage) || !storage.notifications) {
      sendNotificationInfo(tab);
    }

    return initBEAction(url.origin, tab, storage);
  }

  return false;
};

module.exports = browserActionConfigured;
