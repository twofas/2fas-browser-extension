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
const loadFromLocalStorage = require('../localStorage/loadFromLocalStorage');
const TwoFasNotification = require('../notification');
const SDK = require('../sdk');
const extPageOnMessage = require('../partials/extPageOnMessage');
const { delay, storeLog, handleTargetBlank, hidePreloader, storageValidation } = require('../partials');
const { generateDevicesList, setLoggingToggle, setContextMenuToggle, setPushRadio, setPinInfo, setExtName, setExtNameUpdateForm, setModalsListeners, setAdvanced, setMenuLinks, setPinInfoBtns, setShortcutBox, setHamburger, setExtVersion, generateShortcutBox, generateShortcutLink, showIntegrityError, generateDomainsList, setImportDefaultExcludedDomains, setAutoSubmitSwitch, setIconSelect } = require('./functions');

const init = async storage => {
  i18n();

  try {
    await storageValidation(storage);
  } catch (e) {
    if (e.toString().includes('Too many attempts')) {
      showIntegrityError();
      hidePreloader();
      return false;
    }

    return delay(() => {
      return browser.runtime.sendMessage({ action: 'storageReset' })
        .then(() => window.location.reload())
        .catch(async err => await storeLog('error', 38, err, 'storageValidationReload'));
    }, 5300);
  }

  return new SDK().getAllPairedDevices(storage.extensionID)
    .then(generateDevicesList)
    .then(() => generateDomainsList(storage.autoSubmitExcludedDomains))
    .then(setImportDefaultExcludedDomains)
    .then(setPinInfo)
    .then(() => setExtName(storage.browserInfo.name))
    .then(() => setExtNameUpdateForm(storage))
    .then(setModalsListeners)
    .then(setAdvanced)
    .then(setAutoSubmitSwitch)
    .then(setMenuLinks)
    .then(setPinInfoBtns)
    .then(generateShortcutBox)
    .then(generateShortcutLink)
    .then(setShortcutBox)
    .then(setExtVersion)
    .then(setLoggingToggle)
    .then(setContextMenuToggle)
    .then(setPushRadio)
    .then(setHamburger)
    .then(handleTargetBlank)
    .then(setIconSelect)
    .then(() => browser.runtime.onMessage.addListener(extPageOnMessage))
    .then(() => hidePreloader());
};

const optionsPageError = async err => {
  await storeLog('error', 21, err, 'optionsPage');
  return TwoFasNotification.showWithoutTimeout(config.Texts.Error.UndefinedError);
};

window.onload = () => {
  loadFromLocalStorage(['extensionID', 'keys', 'browserInfo', 'attempt', 'autoSubmitExcludedDomains'])
    .then(data => init(data))
    .catch(err => optionsPageError(err));
};
