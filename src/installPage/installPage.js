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

const config = require('../config');
const browser = require('webextension-polyfill');
const i18n = require('../partials/i18n');
const SDK = require('../sdk');
const TwoFasNotification = require('../notification');
const loadFromLocalStorage = require('../localStorage/loadFromLocalStorage');
const subscribeChannel = require('../background/functions/subscribeChannel');
const { delay, extPageOnMessage, handleTargetBlank, hidePreloader, storageValidation, storeLog } = require('../partials');
const { generateQRCode, installContainerHandlers } = require('./functions');

const installPageError = async err => {
  await storeLog('error', 20, err, 'installPage');
  return TwoFasNotification.showWithoutTimeout(config.Texts.Error.OnInstallError);
};

const init = async storage => {
  i18n();

  try {
    await storageValidation(storage);
  } catch (e) {
    if (e.toString().includes('Too many attempts')) {
      return false;
    }
    
    return delay(() => {
      return browser.runtime.sendMessage({ action: 'storageReset' })
        .then(() => window.location.reload())
        .catch(async err => await storeLog('error', 38, err, 'storageValidationReload'));
    }, 5300);
  }

  const channel = await subscribeChannel(storage, null, {
    action: false,
    timeout: false,
    login: false,
    requestID: null,
    notifications: {
      timeout: config.Texts.Error.Timeout,
      error: config.Texts.Error.General
    }
  });

  const configLink = new SDK().generateQRLink(storage.extensionID);

  return generateQRCode(configLink)
    .then(imageURL => installContainerHandlers(channel, imageURL, storage.extensionID))
    .then(handleTargetBlank)
    .then(() => hidePreloader(true))
    .then(() => browser.runtime.onMessage.addListener(extPageOnMessage));
};

loadFromLocalStorage(null)
  .then(init)
  .catch(err => installPageError(err));
