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

import config from '@/config.js';
import browser from 'webextension-polyfill';
import i18n from '@partials/i18n.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import TwoFasNotification from '@notification';
import SDK from '@sdk';
import extPageOnMessage from '@partials/extPageOnMessage.js';
import { delay, storeLog, handleTargetBlank, hidePreloader, storageValidation } from '@partials';
import { generateDevicesList, setLoggingToggle, setContextMenuToggle, setPushRadio, setPinInfo, setExtName, setExtNameUpdateForm, setModalsListeners, setAdvanced, setMenuLinks, setPinInfoBtns, setShortcutBox, setHamburger, setExtVersion, generateShortcutBox, generateShortcutLink, showIntegrityError, generateDomainsList, setImportDefaultExcludedDomains, setAutoSubmitSwitch, setIconSelect } from '@optionsPage/functions';

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

    return delay(async () => {
      try {
        await browser.runtime.sendMessage({ action: 'storageReset' });
        window.location.reload();
      } catch (err) {
        await storeLog('error', 38, err, 'storageValidationReload');
      }
    }, 5300);
  }

  const devicesList = await new SDK().getAllPairedDevices(storage.extensionID);
  generateDevicesList(devicesList);
  generateDomainsList(storage.autoSubmitExcludedDomains);

  await Promise.all([
    setPinInfo(),
    setAutoSubmitSwitch(),
    generateShortcutBox(),
    setLoggingToggle(),
    setContextMenuToggle(),
    setPushRadio(),
    setIconSelect()
  ]);

  setImportDefaultExcludedDomains();
  setExtName(storage.browserInfo.name);
  setExtNameUpdateForm(storage);
  setModalsListeners();
  setAdvanced();
  setMenuLinks();
  setPinInfoBtns();
  generateShortcutLink();
  setShortcutBox();
  setExtVersion();
  setHamburger();
  handleTargetBlank();

  browser.runtime.onMessage.addListener(extPageOnMessage);
  hidePreloader();
};

const optionsPageError = async err => {
  await storeLog('error', 21, err, 'optionsPage');
  return TwoFasNotification.showWithoutTimeout(config.Texts.Error.UndefinedError);
};

window.onload = async () => {
  try {
    const data = await loadFromLocalStorage(['extensionID', 'keys', 'browserInfo', 'attempt', 'autoSubmitExcludedDomains']);
    await init(data);
  } catch (err) {
    await optionsPageError(err);
  }
};
