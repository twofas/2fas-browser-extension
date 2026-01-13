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

import browser from 'webextension-polyfill';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import createFirefoxOptionsMenu from '@background/functions/createFirefoxOptionsMenu.js';

const createContextMenus = () => {
  return loadFromLocalStorage(['contextMenu'])
    .then(storage => {
      if (!('contextMenu' in storage)) {
        return saveToLocalStorage({ contextMenu: true }, storage);
      }

      return storage;
    })
    .then(async storage => {
      if (storage.contextMenu) {
        const options = {
          title: browser.i18n.getMessage('shortcutDesc'),
          id: 'twofas-context-menu',
          contexts: ['page', 'editable'], // @TODO: Safari bug with double contextMenu on editable
          enabled: true,
          type: 'normal',
          visible: true
        };

        if (process.env.EXT_PLATFORM === 'Firefox' || process.env.EXT_PLATFORM === 'Safari') {
          options.icons = {
            16: '/images/icons/icon16.png',
            32: '/images/icons/icon32.png'
          };
        }

        await browser.contextMenus.removeAll();
        browser.contextMenus.create(options);
      }

      createFirefoxOptionsMenu();
    })
    .catch(() => {});
};

export default createContextMenus;
