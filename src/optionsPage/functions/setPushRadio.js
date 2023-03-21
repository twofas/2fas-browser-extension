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

const { loadFromLocalStorage, saveToLocalStorage } = require('../../localStorage');

const setPushRadio = () => {
  if (process.env.EXT_PLATFORM === 'Safari') {
    const pushRadios = document.querySelectorAll('input[name="pushConfig"]');

    if (pushRadios) {
      pushRadios.forEach(radio => {
        if (radio.value === 'custom') {
          radio.checked = true;
        }

        radio.disabled = true;
      });
    }

    return;
  }

  return loadFromLocalStorage(['nativePush'])
    .then(storage => {
      if (!('nativePush' in storage)) {
        return saveToLocalStorage({ nativePush: true }, storage);
      }

      return storage;
    })
    .then(storage => {
      const pushRadios = document.querySelectorAll('input[name="pushConfig"]');

      if (pushRadios) {
        pushRadios.forEach(radio => {
          if (radio.value === 'custom' && !storage.nativePush) {
            radio.checked = true;
          } else if (radio.value === 'native' && storage.nativePush) {
            radio.checked = true;
          }
        });
      }

      return Promise.resolve();
    })
    .catch(() => {});
};

module.exports = setPushRadio;
