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
import clearLocalStorage from '@localStorage/clearLocalStorage.js';
import storeLog from '@partials/storeLog.js';
import delay from '@partials/delay.js';

/**
 * Handles the Safari storage reset action by showing a confirmation modal and clearing storage.
 *
 * @returns {void}
 */
const handleSafariReset = () => {
  showConfirmModal(
    browser.i18n.getMessage('modalSafariResetHeader'),
    browser.i18n.getMessage('modalSafariResetText'),
    () => {
      return clearLocalStorage()
        .then(() => TwoFasNotification.show(config.Texts.Success.SafariReset))
        .then(() => delay(() => browser.runtime.sendMessage({ action: 'storageReset' }).then(() => window.location.reload()), 2000))
        .catch(async err => {
          await storeLog('error', 36, err, 'handleSafariReset');
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    }
  );
};

export default handleSafariReset;
