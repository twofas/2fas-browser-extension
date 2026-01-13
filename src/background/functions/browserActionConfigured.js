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

import config from '@/config.js';
import browser from 'webextension-polyfill';
import TwoFasNotification from '@notification/index.js';
import initBEAction from '@background/functions/initBEAction.js';
import saveToLocalStorage from '@localStorage/saveToLocalStorage.js';
import sendNotificationInfo from '@background/functions/sendNotificationInfo.js';
import checkIconTitleText from '@background/functions/checkIconTitleText.js';

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

export default browserActionConfigured;
