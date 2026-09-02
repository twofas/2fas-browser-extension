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
import pageError from '@partials/pageError.js';
import SDK from '@sdk';
import extPageOnMessage from '@partials/extPageOnMessage.js';
import { awaitRegistration, delay, handleTargetBlank, hidePreloader, isRegistrationPending, isTransportError, showIntegrityError, storageValidation, storeLog } from '@partials';
import S from '@/selectors.js';
import { REGISTRATION_STORAGE_KEY } from '@background/functions/update/registrationRetryPolicy.js';
import { generateDevicesList, generateDevicesErrorRow, setLoggingToggle, setContextMenuToggle, setPushRadio, setPinInfo, setExtName, setExtNameUpdateForm, setModalsListeners, setAdvanced, setMenuLinks, setPinInfoBtns, setShortcutBox, setHamburger, setExtVersion, generateShortcutBox, generateShortcutLink, generateDomainsList, setImportDefaultExcludedDomains, setAutoSubmitSwitch, setIconSelect, handleStorageChange } from '@optionsPage/functions';

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

    // Keys written, registration POST still owned by the durable retry (offline
    // install / reset): this is a healthy half-state, not corruption. Resetting
    // would discard the pending record and burn the attempt budget, so wait it out —
    // storageValidation already showed the "we will try to fix it" notification.
    if (isRegistrationPending(storage)) {
      // Nothing on this page works without an extensionID (the devices table is
      // API-sourced), so revealing a half-initialised shell would be worse than
      // waiting. The listener reloads once the durable retry registers.
      awaitRegistration();
      return false;
    }

    return delay(async () => {
      try {
        const res = await browser.runtime.sendMessage({ action: 'storageReset' });

        if (res?.status === 'ok' && !res?.pending) {
          window.location.reload();
          return;
        }

        // `pending`: nothing was regenerated because the durable create owns the keys.
        // `ok` + pending: it WAS regenerated, but the POST has not landed, so reloading
        // would only show a pairing page without an extensionID.
        if (res?.status === 'pending' || res?.pending) {
          // The background refused for the same reason as the check above (the race it
          // could not see from here), or it regenerated but could not register yet.
          // Non-destructive: no overlay, no reload — wait for the durable retry.
          awaitRegistration();
          return;
        }

        // Refused / failed reset: never loop on reload — show the overlay (with
        // its own Reset button) instead.
        showIntegrityError();
        hidePreloader();
      } catch (err) {
        // Messaging itself failed (background restarting, port closed): same
        // non-destructive exit as a refused reset — the overlay with its Reset
        // button, never a stuck preloader.
        showIntegrityError();
        hidePreloader();
        await storeLog('error', 38, err, 'storageValidationReload');
      }
    }, 5300);
  }

  // v1.9.0: the backend rejects this extension's requests (no registered
  // signing key after the migration window, or a key conflict escalated) —
  // storage itself is intact, but only a reinstall/re-pair can recover.
  if (storage?.signing?.registrationRequired) {
    showIntegrityError();
    hidePreloader();
    return false;
  }

  const devicesTbody = document.querySelector(S.optionsPage.devicesList);
  let devicesList = null;
  let devicesErrorReason = null;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    devicesErrorReason = 'offline';
    TwoFasNotification.show(config.Texts.Error.NoInternet);
  } else {
    try {
      const apiResponse = await new SDK().getAllPairedDevices(storage.extensionID);

      if (Array.isArray(apiResponse)) {
        devicesList = apiResponse;
      } else {
        devicesErrorReason = 'apiError';
      }
    } catch (err) {
      if (!isTransportError(err)) {
        await storeLog('error', 21, err, 'optionsPage:getAllPairedDevices');
      }
      devicesErrorReason = 'apiError';
    }

    if (devicesErrorReason) {
      TwoFasNotification.show(config.Texts.Error.DevicesUnavailable);
    }
  }

  if (devicesErrorReason) {
    generateDevicesErrorRow(devicesTbody, devicesErrorReason);
  } else {
    generateDevicesList(devicesList);
  }

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
  browser.storage.onChanged.addListener(handleStorageChange);
  hidePreloader();
};

const optionsPageError = pageError(21, 'optionsPage', config.Texts.Error.UndefinedError);

window.onload = async () => {
  try {
    const data = await loadFromLocalStorage(['extensionID', 'keys', 'browserInfo', 'attempt', 'autoSubmitExcludedDomains', 'signing', REGISTRATION_STORAGE_KEY]);
    await init(data);
  } catch (err) {
    await optionsPageError(err);
  }
};
