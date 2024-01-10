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

/* global FormData */
const browser = require('webextension-polyfill');
const S = require('../../selectors');
const generateDomainsList = require('./generateDomainsList');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');
const TwoFasNotification = require('../../notification');
const config = require('../../config');
const storeLog = require('../../partials/storeLog');
const hideDomainModal = require('./hideDomainModal');

const isValidUrl = urlString => {
  const urlRegex = /^(((http|https):\/\/|)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,6}(:[0-9]{1,5})?(\/.*)?)$/;
  return urlRegex.test(urlString);
};

const domainModalFormSubmit = e => {
  e.preventDefault();
  e.stopPropagation();

  const data = new FormData(e.target);
  const domain = data.get('domain').trim();
  const validation = document.querySelector(S.optionsPage.domainModal.validation);

  if (!domain || domain.length <= 0) {
    validation.innerText = browser.i18n.getMessage('optionsDomainRequired') || 'Domain is required';
    return false;
  }

  if (domain.length > 256) {
    validation.innerText = browser.i18n.getMessage('optionsDomainTooLong') || 'Domain is too long';
    return false;
  }

  if (!isValidUrl(domain)) {
    validation.innerText = browser.i18n.getMessage('optionsDomainIncorrect') || 'Domain is not correct';
    return false;
  }

  const url = domain.replace(/^https?:\/\/(www)?/, '').replace(/\/$/, '');

  return loadFromLocalStorage('autoSubmitExcludedDomains')
    .then(storage => {
      const autoSubmitExcludedDomains = storage.autoSubmitExcludedDomains;

      if (autoSubmitExcludedDomains.includes(url)) {
        validation.innerText = browser.i18n.getMessage('optionsDomainExists') || 'Domain exists on excluded list';
        return false;
      }

      autoSubmitExcludedDomains.push(url);

      return saveToLocalStorage({ autoSubmitExcludedDomains }, storage);
    })
    .then(res => {
      if (res) {
        generateDomainsList(res.autoSubmitExcludedDomains);
        hideDomainModal();
        TwoFasNotification.show(config.Texts.Success.DomainExcluded);
      }
    })
    .catch(async err => {
      await storeLog('error', 45, err, 'domainModalFormSubmit');
      return TwoFasNotification.show(config.Texts.Error.UndefinedError, null, true);
    });
};

module.exports = domainModalFormSubmit;
