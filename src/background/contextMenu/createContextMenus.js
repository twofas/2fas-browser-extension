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
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import createFirefoxOptionsMenu from './createFirefoxOptionsMenu.js';

/**
 * Creates context menu items for the extension.
 * @return {Promise<void>}
 */
const createContextMenus = async () => {
  let storage;

  try {
    storage = await loadFromLocalStorage(['contextMenu']);

    if (!('contextMenu' in storage)) {
      storage = await saveToLocalStorage({ contextMenu: true }, storage);
    }

    if (storage.contextMenu) {
      const options = {
        title: browser.i18n.getMessage('shortcutDesc'),
        id: 'twofas-context-menu',
        contexts: ['page', 'editable', 'frame'],
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
  } catch (err) {
    // Silently fail - context menu is not critical
  } finally {
    storage = null;
  }
};

export default createContextMenus;
