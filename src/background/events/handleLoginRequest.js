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
import config from '@/config.js';
import closeRequest from '@background/functions/closeRequest.js';
import TwoFasNotification from '@notification/index.js';
import Crypt from '@background/functions/Crypt.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import storeLog from '@partials/storeLog.js';
import sendMessageToTab from '@partials/sendMessageToTab.js';

const handleLoginRequest = (tabID, data) => {
  const crypt = new Crypt();

  return browser.tabs.get(tabID)
    .then(() => loadFromLocalStorage(['keys']))
    .then(storage => {
      const privateKey = crypt.stringToArrayBuffer(storage.keys.privateKey);
      return crypt.importKey(privateKey, 'pkcs8', ['decrypt']);
    })
    .then(key => crypt.decrypt(key, crypt.stringToArrayBuffer(data.token)))
    .then(token => crypt.decodeText(token))
    .then(token => {
      const loginData = data;
      loginData.token = token;

      return sendMessageToTab(tabID, { action: 'inputToken', ...loginData });
    })
    .then(() => closeRequest(tabID, data.token_request_id))
    .catch(async err => {
      if (err.toString().includes('No tab with id') || err.toString().includes('Invalid tab ID')) {
        return closeRequest(tabID, data.token_request_id)
          .then(() => TwoFasNotification.show(config.Texts.Error.LackOfTab, tabID));
      }

      await storeLog('error', 8, err, 'handleLoginRequest');
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
    });
};

export default handleLoginRequest;
