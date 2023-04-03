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

const browser = require('webextension-polyfill');
const config = require('../../config');
const TwoFasNotification = require('../../notification');
const showConfirmModal = require('./showConfirmModal');
const clearLocalStorage = require('../../localStorage/clearLocalStorage');
const storeLog = require('../../partials/storeLog');
const delay = require('../../partials/delay');

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

module.exports = handleSafariReset;
