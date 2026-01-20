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
import config from '../config.js';
import SDK from '../sdk/index.js';
import TwoFasNotification from '../notification/index.js';
import storeLog from './storeLog.js';
import saveToLocalStorage from '../localStorage/saveToLocalStorage.js';
import S from '../selectors.js';

let updateTimeout = false;

/**
 * Handles the extension name update form submission.
 * @param {Object} storage - The storage object containing extension data
 * @param {Event} e - The form submit event
 * @returns {Promise<boolean>|boolean} False on validation error, Promise on API call
 */
const extNameUpdate = (storage, e) => {
  e.preventDefault();
  e.stopPropagation();

  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }

  const saveBtn = document.querySelector(S.extName.updateBtn);
  saveBtn.setAttribute('disabled', 'disabled');

  const errorText = document.querySelector(S.extName.error);
  errorText.classList.remove('error', 'success');

  const extNameEl = document.querySelector(S.extName.input);
  extNameEl.value = extNameEl.value.trim();

  const data = new FormData(e.target);
  const extName = data.get('ext-name');

  if (!extName || extName.length <= 0) {
    saveBtn.removeAttribute('disabled');
    errorText.classList.add('error');
    errorText.innerText = `${config.Texts.Error.ExtNameRequired.Title}. ${config.Texts.Error.ExtNameRequired.Message}`;
    return false;
  } else if (extName.length < 3) {
    saveBtn.removeAttribute('disabled');
    errorText.classList.add('error');
    errorText.innerText = `${config.Texts.Error.ExtNameMinLength.Title}. ${config.Texts.Error.ExtNameMinLength.Message}`;
    return false;
  } else if (extName.length > 32) {
    saveBtn.removeAttribute('disabled');
    errorText.classList.add('error');
    errorText.innerText = `${config.Texts.Error.ExtNameMaxLength.Title}. ${config.Texts.Error.ExtNameMaxLength.Message}`;
    return false;
  }

  const browserInfo = storage.browserInfo;
  browserInfo.name = extName;

  return new SDK().updateBrowserExtension(storage.extensionID, browserInfo)
    .then(() => saveToLocalStorage({ browserInfo }, storage))
    .then(() => {
      errorText.classList.add('success');
      errorText.innerText = `${config.Texts.Success.ExtNameUpdated.Title}. ${config.Texts.Success.ExtNameUpdated.Message}`;

      updateTimeout = setTimeout(() => {
        errorText.classList.remove('success');
      }, 5000);

      return true;
    })
    .then(() => saveBtn.removeAttribute('disabled'))
    .catch(async err => {
      await storeLog('error', 25, err, 'extNameUpdate');
      return TwoFasNotification.showWithoutTimeout(config.Texts.Error.UndefinedError);
    });
};

export default extNameUpdate;
