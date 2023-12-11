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
const S = require('../../selectors');
const generateDomainsList = require('./generateDomainsList');
const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');

const isValidUrl = urlString => {
  const urlPattern = new RegExp('^(https?:\\/\\/)?' +
  '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
  '((\\d{1,3}\\.){3}\\d{1,3}))' +
  '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
  '(\\?[;&a-z\\d%_.~+=-]*)?' +
  '(\\#[-a-z\\d_]*)?$', 'i');
  return !!urlPattern.test(urlString);
}

const domainModalFormSubmit = e => {
  e.preventDefault();
  e.stopPropagation();

  const data = new FormData(e.target);
  const domain = data.get('domain').trim();
  const validation = document.querySelector(S.optionsPage.domainModal.validation);

  if (!isValidUrl(domain)) {
    validation.innerText = 'Domain is not correct'; // @TODO: i18n
    return false;
  }

  const url = domain.replace(/^https?:\/\/(www)?/, '').replace(/\/$/, '');

  return loadFromLocalStorage('autoSubmitExcludedDomains')
    .then(storage => {
      const autoSubmitExcludedDomains = storage.autoSubmitExcludedDomains;

      if (autoSubmitExcludedDomains.includes(url)) {
        validation.innerText = 'Domain exists on excluded list'; // @TODO: i18n
        return false;
      }

      autoSubmitExcludedDomains.push(url);

      return saveToLocalStorage({ autoSubmitExcludedDomains }, storage);
    })
    .then(res => {
      if (res) {
        validation.innerText = '';

        const domainModal = document.querySelector(S.optionsPage.domainModal.element);
        domainModal.classList.add('hidden');

        generateDomainsList(res.autoSubmitExcludedDomains);
      }
    })
    .catch(err => {
      // @TODO: check err
      console.log(err);
    });

  /*
    @TODO:
    ShowPush
  */
};

module.exports = domainModalFormSubmit;
