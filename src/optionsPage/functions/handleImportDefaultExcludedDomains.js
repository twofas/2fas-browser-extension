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
import TwoFasNotification from '@notification';
import config from '@/config.js';
import storeLog from '@partials/storeLog.js';

/**
 * Handles import of default excluded domains for auto-submit feature.
 *
 * @param {Event} e - The click event
 * @returns {Promise<void>} A promise that resolves when domains are imported and UI is updated
 */
const handleImportDefaultExcludedDomains = e => {
  e.preventDefault();
  e.stopPropagation();

  // The background merges the defaults into the list (de-duplicated) under the
  // shared lock; the list re-renders from the storage.onChanged listener.
  return browser.runtime.sendMessage({ action: 'updateList', list: 'domains', op: 'importDefaults' })
    .then(res => {
      if (!res || res.status !== 'ok') {
        throw new Error('updateList importDefaults failed');
      }

      return TwoFasNotification.show(config.Texts.Success.DomainExcluded);
    })
    .catch(async err => {
      await storeLog('error', 47, err, 'handleImportDefaultExcludedDomains');
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
    });
};

export default handleImportDefaultExcludedDomains;
