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
import i18n from '@partials/i18n.js';
import SDK from '@sdk';
import TwoFasNotification from '@/notification';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import subscribeChannel from '@/background/functions/subscribeChannel.js';
import { delay, extPageOnMessage, handleTargetBlank, hidePreloader, storageValidation, storeLog } from '@partials';
import { generateQRCode, installContainerHandlers, showIntegrityError } from '@installPage/functions';

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
      hidePreloader(true);
      showIntegrityError();
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
