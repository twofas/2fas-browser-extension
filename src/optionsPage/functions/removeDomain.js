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

const config = require('../../config');
const browser = require('webextension-polyfill');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const storeLog = require('../../partials/storeLog');
const showConfirmModal = require('./showConfirmModal');
const TwoFasNotification = require('../../notification');
const removeDomainFromDOM = require('./removeDomainFromDOM');

const removeDomain = function (e) {
  e.preventDefault();
  e.stopPropagation();

  const el = this;
  const domain = el?.dataset?.domain;

  if (!domain) {
    return storeLog('error', 31, new Error('Wrong domain'), 'removeDomain')
      .then(() => TwoFasNotification.show(config.Texts.Error.RemoveDeviceBadData, null, true))
      .catch(() => {});
  }

  showConfirmModal(
    browser.i18n.getMessage('modalExcludeDomainHeader'),
    browser.i18n.getMessage('modalExcludeDomainText').replace('DOMAIN', domain),
    () => {
      return loadFromLocalStorage(['autoSubmitExcludedDomains'])
        .then(data => {
          const newExcludedList = data.autoSubmitExcludedDomains.filter(d => d !== domain);
          return saveToLocalStorage({ autoSubmitExcludedDomains: newExcludedList }, {});
        })
        .then(() => removeDomainFromDOM(domain))
        .then(() => TwoFasNotification.show(config.Texts.Success.DomainExcludedRemoved))
        .catch(async err => {
          await storeLog('error', 22, err, 'removeDevice');
          return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
        });
    }
  );
}

module.exports = removeDomain;
