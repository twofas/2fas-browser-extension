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
const createTextElement = require('../../partials/DOMElements/createTextElement');
const generateEmptyShortcutBox = require('./generateEmptyShortcutBox');
const S = require('../../selectors');

const generateShortcutBox = () => {
  if (process.env.EXT_PLATFORM === 'Safari') {
    return;
  }

  return browser.commands.getAll()
    .then(res => {
      let data = res;
      data = data.filter(command => command.name === 'tokenRequest');

      data[0].shortcut =
        data[0].shortcut
          .replace(/⌘/g, 'Cmd+')
          .replace(/⇧/g, 'Shift+')
          .replace(/⌥/g, 'Alt+')
          .replace(/⌃/g, 'Ctrl+');

      if (data[0].shortcut[data.length - 1] === '+') {
        data[0].shortcut = data[0].shortcut.slice(0, -1);
      }

      // Remove old boxes
      const oldBoxes = document.querySelectorAll(S.optionsPage.shortcut.editBoxBtn);
      const oldPluses = document.querySelectorAll(S.optionsPage.shortcut.editBoxPlus);

      oldBoxes.forEach(box => box.remove());
      oldPluses.forEach(plus => plus.remove());

      const box = document.querySelector(S.optionsPage.shortcut.editBox);
      let s = data.filter(s => s.name === 'tokenRequest');

      if (!s || !s[0] || !s[0].shortcut) {
        return generateEmptyShortcutBox(box);
      }

      s = s[0]?.shortcut;

      if (s.length <= 0) {
        return generateShortcutBox(box);
      }

      s = s.split('+');

      const elementsLength = s.length;

      s.reverse().forEach((btn, i) => {
        const filteredBtn = btn.replace('MacCtrl', 'Ctrl');
        const btnBox = createTextElement('div', filteredBtn);
        btnBox.classList.add('twofas-shortcut-edit-box-btn');
        box.prepend(btnBox);

        if (i !== elementsLength - 1) {
          const plusBox = createTextElement('div', '+');
          plusBox.classList.add('twofas-shortcut-edit-box-plus');
          box.prepend(plusBox);
        }
      });

      const text = document.querySelector(S.optionsPage.shortcut.editText);
      if (text) {
        text.textContent = data[0].shortcut.replace('MacCtrl', 'Ctrl');
      }

      const editBtn = document.querySelector(S.optionsPage.shortcut.edit);
      if (editBtn) {
        editBtn.innerText = browser.i18n.getMessage('edit');
      }

      const infoBtn = document.querySelector(S.optionsPage.shortcut.info);
      if (infoBtn) {
        infoBtn.innerText = browser.i18n.getMessage('info');
      }

      const shortcutDescription = document.querySelector(S.optionsPage.shortcut.description);
      if (shortcutDescription) {
        shortcutDescription.innerText = browser.i18n.getMessage('shortcutUseDesc');
      }
    });
};

module.exports = generateShortcutBox;
