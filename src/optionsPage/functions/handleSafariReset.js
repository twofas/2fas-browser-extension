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
import TwoFasNotification from '@notification';
import showConfirmModal from '@optionsPage/functions/showConfirmModal.js';
import resetExtensionStorage, { RESET_PENDING } from '@partials/resetExtensionStorage.js';
import awaitRegistration from '@partials/awaitRegistration.js';
import storeLog from '@partials/storeLog.js';

/**
 * Handles the Danger Zone "Reset Browser Extension" button (every platform since
 * 1.9.0; the name is historical — it was Safari-only): confirmation modal, then
 * the same non-destructive reset as the integrity overlay — the background mints
 * the new identity and clears storage itself, the page reloads only once it
 * confirms. Nothing is wiped page-side, so a refused or failed reset leaves the
 * current configuration intact.
 *
 * @returns {void}
 */
const handleSafariReset = () => {
  showConfirmModal(
    browser.i18n.getMessage('modalSafariResetHeader'),
    browser.i18n.getMessage('modalSafariResetText'),
    () => {
      return resetExtensionStorage()
        .then(outcome => {
          if (outcome === RESET_PENDING) {
            // Rebuilt, but the registration POST is queued on the durable retry.
            awaitRegistration();
            return TwoFasNotification.show(config.Texts.Error.ResetPending, null, true);
          }
        })
        .catch(async err => {
          await storeLog('error', 36, err, 'handleSafariReset');
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    }
  );
};

export default handleSafariReset;
