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
import SDK from '@sdk';
import pageError from '@partials/pageError.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import subscribeChannel from '@/background/functions/subscribeChannel.js';
import { awaitRegistration, delay, extPageOnMessage, handleTargetBlank, hidePreloader, isRegistrationPending, showIntegrityError, storageValidation, storeLog } from '@partials';
import { generateQRCode, installContainerHandlers, showRecoveredInfo } from '@installPage/functions';

const installPageError = pageError(20, 'installPage', config.Texts.Error.OnInstallError);

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

    // Keys written, registration POST still owned by the durable retry (offline
    // install / reset / self-heal): a healthy half-state, not corruption. Resetting
    // would discard the pending record, mint another keypair and bump `attempt`
    // until this page gives up — wait for the retry instead.
    if (isRegistrationPending(storage)) {
      // Do NOT reveal the pairing UI: there is no extensionID yet, so the QR is a
      // placeholder and its handlers were never bound. The preloader is honest here —
      // the extension really is still working — and the listener reloads the page the
      // moment the durable retry commits an extensionID.
      awaitRegistration();
      return false;
    }

    return delay(() => {
      return browser.runtime.sendMessage({ action: 'storageReset' })
        .then(res => {
          if (res?.status === 'ok' && !res?.pending) {
            window.location.reload();
            return;
          }

          // `pending`: nothing was regenerated because the durable create owns the keys.
          // `ok` + pending: it WAS regenerated, but the POST has not landed yet.
          // Either way there is no identity to pair with — wait, never reload.
          if (res?.status === 'pending' || res?.pending) {
            awaitRegistration();
            return;
          }

          // Refused / failed reset: never loop on reload — show the overlay (with
          // its own Reset button) instead.
          hidePreloader(true);
          showIntegrityError();
        })
        .catch(async err => {
          // Messaging itself failed (background restarting, port closed): same
          // non-destructive exit as a refused reset — the overlay with its Reset
          // button, never a stuck preloader.
          hidePreloader(true);
          showIntegrityError();
          await storeLog('error', 38, err, 'storageValidationReload');
        });
    }, 5300);
  }

  // v1.9.0: backend rejects this extension's requests — pairing cannot
  // proceed; only a reinstall/re-pair (fresh registration) can recover.
  if (storage?.signing?.registrationRequired) {
    hidePreloader(true);
    showIntegrityError();
    return false;
  }

  // Opened by the background after an automatic storage regeneration (Safari
  // self-heal): explain why the device has to be paired again.
  showRecoveredInfo();

  const channel = await subscribeChannel(storage, null, {
    action: false,
    timeout: false,
    login: false,
    requestID: null,
    notifications: {
      timeout: config.Texts.Error.Timeout
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
