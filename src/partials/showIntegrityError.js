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
import config from '../config.js';
import S from '../selectors.js';
import TwoFasNotification from '../notification/index.js';
import resetExtensionStorage, { RESET_PENDING } from './resetExtensionStorage.js';
import awaitRegistration from './awaitRegistration.js';
import storeLog from './storeLog.js';

/**
 * Shows the storage integrity error overlay (options / install page) and wires
 * its Reset button — the overlay covers the whole page (including the Advanced
 * section), so the reset must be reachable from the overlay itself. Reset = new
 * keys + new registration + pair again; a confirmation guards the click.
 *
 * @returns {void}
 */
const showIntegrityError = () => {
  const el = document.querySelector(S.optionsPage.integrityError);

  if (!el) {
    return;
  }

  el.classList.add('show-integrity-error');

  const resetBtn = el.querySelector(S.optionsPage.integrityReset);

  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = 'true';
    resetBtn.addEventListener('click', () => {
      if (!window.confirm(browser.i18n.getMessage('modalSafariResetText') || 'Reset the 2FAS Browser Extension?')) {
        return;
      }

      resetExtensionStorage()
        .then(outcome => {
          if (outcome === RESET_PENDING) {
            // The identity was rebuilt but its registration is still queued (offline /
            // API down). Not an error — say so instead of "something went wrong", and
            // reload the page as soon as the retry lands.
            awaitRegistration();
            return TwoFasNotification.show(config.Texts.Error.ResetPending, null, true);
          }
        })
        .catch(async err => {
          await storeLog('error', 36, err, 'integrityReset');
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    });
  }
};

export default showIntegrityError;
