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

const S = require('../../selectors');
const hideConfirmModal = require('./hideConfirmModal');
const hideDomainModal = require('./hideDomainModal');
const confirmModalBackdropClick = require('./confirmModalBackdropClick');
const domainModalBackdropClick = require('./domainModalBackdropClick');
const domainModalFormSubmit = require('./domainModalFormSubmit');
const showDomainModal = require('./showDomainModal');

const setModalsListeners = () => {
  const confirmModalCancel = document.querySelectorAll(S.optionsPage.confirmModal.cancel);
  Array.from(confirmModalCancel).forEach(el => el.addEventListener('click', hideConfirmModal));

  const domainModalCancel = document.querySelectorAll(S.optionsPage.domainModal.cancel);
  Array.from(domainModalCancel).forEach(el => el.addEventListener('click', hideDomainModal));

  const excludeDomainAdd = document.querySelectorAll(S.optionsPage.autoSubmit.add);
  Array.from(excludeDomainAdd).forEach(el => el.addEventListener('click', showDomainModal));

  const confirmModal = document.querySelector(S.optionsPage.confirmModal.element);
  confirmModal.addEventListener('click', confirmModalBackdropClick);

  const domainModal = document.querySelector(S.optionsPage.domainModal.element);
  domainModal.addEventListener('click', domainModalBackdropClick);

  const domainModalForm = document.querySelector(S.optionsPage.domainModal.form);
  domainModalForm.addEventListener('submit', domainModalFormSubmit);

  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (!confirmModal.classList.contains('hidden')) {
        return hideConfirmModal();
      }

      if (!domainModal.classList.contains('hidden')) {
        return hideDomainModal();
      }
    }
  })
};

module.exports = setModalsListeners;
