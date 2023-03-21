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
const saveToLocalStorage = require('../../localStorage/saveToLocalStorage');
const subscribeChannel = require('./subscribeChannel');
const TwoFasNotification = require('../../notification');
const SDK = require('../../sdk');
const storeLog = require('../../partials/storeLog');

const initBEAction = (url, tab, storageData) => {
  const now = new Date().getTime();
  let storage = storageData;
  let condition = false;
  let diff;

  if (!storage[`tabData-${tab?.id}`]) {
    storage[`tabData-${tab.id}`] = {};
  }

  const tabData = storage[`tabData-${tab.id}`];

  if (!storage[`tabData-${tab?.id}`]?.lastFocusedInput) {
    return TwoFasNotification.show(config.Texts.Warning.SelectInput, tab?.id);
  }

  if (!storage[`tabData-${tab?.id}`]?.lastAction) {
    condition = true;
  } else {
    diff = (now - storage[`tabData-${tab.id}`].lastAction) / 1000;
    condition = Math.round(diff) >= config.ResendPushTimeout;
  }

  if (condition) {
    tabData.lastAction = now;

    return saveToLocalStorage({ [`tabData-${tab?.id}`]: tabData }, storage)
      .then(() => new SDK().request2FAToken(storage.extensionID, url))
      .then(requestData => {
        tabData.requestID = requestData.token_request_id;
        return saveToLocalStorage({ [`tabData-${tab?.id}`]: tabData }, storage);
      })
      .then(sD => {
        storage = sD;

        return subscribeChannel(storage, tab?.id, {
          action: true,
          timeout: true,
          login: true,
          requestID: storage[`tabData-${tab?.id}`].requestID,
          notifications: {
            timeout: config.Texts.Error.PushExpired(url),
            error: config.Texts.Error.General
          }
        });
      })
      .then(channel => channel.connect())
      .then(() => TwoFasNotification.show(config.Texts.Success.PushSent, tab?.id))
      .catch(async err => {
        await storeLog('error', 5, err, tabData?.url);
        return TwoFasNotification.show(config.Texts.Error.UndefinedError, tab?.id);
      });
  } else {
    if (diff > 1) {
      return TwoFasNotification.show(config.Texts.Warning.TooSoon(diff), tab?.id);
    }
  }
};

module.exports = initBEAction;
