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
import createTextElement from '@partials/DOMElements/createTextElement.js';
import S from '@/selectors.js';

/**
 * Generates the shortcut display box with an unknown state when no shortcut is configured.
 *
 * @param {HTMLElement} box - The container element for the shortcut display
 * @returns {void}
 */
const generateEmptyShortcutBox = box => {
  const btnBox = createTextElement('div', browser.i18n.getMessage('unknown').toUpperCase());

  btnBox.classList.add('twofas-shortcut-edit-box-btn');
  box.prepend(btnBox);

  const text = document.querySelector(S.optionsPage.shortcut.editText);
  if (text) {
    text.textContent = browser.i18n.getMessage('unknown').toUpperCase();
  }

  const editInfoBtn = document.querySelector(`${S.optionsPage.shortcut.edit}, ${S.optionsPage.shortcut.info}`);
  if (editInfoBtn) {
    editInfoBtn.innerText = browser.i18n.getMessage('set');
  }

  const shortcutDescription = document.querySelector(S.optionsPage.shortcut.description);
  if (shortcutDescription) {
    shortcutDescription.innerText = browser.i18n.getMessage('shortcutSetDesc');
  }
};

export default generateEmptyShortcutBox;
