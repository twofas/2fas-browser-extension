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

/* global FormData */
import browser from 'webextension-polyfill';
import S from '@/selectors.js';
import generateDomainsList from '@optionsPage/functions/generateDomainsList.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage';
import TwoFasNotification from '@notification';
import config from '@/config.js';
import storeLog from '@partials/storeLog.js';
import hideDomainModal from '@optionsPage/functions/hideDomainModal.js';

/**
 * Validates if the provided string is a valid URL format.
 *
 * @param {string} urlString - The URL string to validate
 * @returns {boolean} True if the URL is valid, false otherwise
 */
const isValidUrl = urlString => {
  const urlRegex = /^(((http|https):\/\/|)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,6}(:[0-9]{1,5})?(\/.*)?)$/;
  return urlRegex.test(urlString);
};

/**
 * Handles the domain modal form submission, validates input, and saves the excluded domain.
 *
 * @param {Event} e - The form submit event
 * @returns {Promise<void>|boolean} A promise that resolves after saving, or false on validation error
 */
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

  const urlTemp = domain.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  let url;

  try {
    const urlObj = new URL(`https://${urlTemp}`);
    url = urlObj.hostname.replace(/^(www\.)?/, '').replace(/\/$/, '');
  } catch (err) {
    validation.innerText = browser.i18n.getMessage('optionsDomainIncorrect') || 'Domain is not correct';
    return false;
  }

  return loadFromLocalStorage('autoSubmitExcludedDomains')
    .then(storage => {
      let autoSubmitExcludedDomains = storage?.autoSubmitExcludedDomains;

      if (!autoSubmitExcludedDomains) {
        autoSubmitExcludedDomains = [];
      }

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

export default domainModalFormSubmit;
