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
import saveToLocalStorage from '@localStorage/saveToLocalStorage.js';
import createContextMenus from '@background/contextMenu/createContextMenus.js';

/**
 * Handles change of the context menu toggle and updates browser context menus accordingly.
 *
 * @param {Event} e - The change event from the checkbox input
 * @returns {Promise<void>} A promise that resolves when the context menu is updated
 */
const handleContextMenuChange = e => {
  return saveToLocalStorage({ contextMenu: e.currentTarget.checked })
    .then(async storage => {
      if (storage.contextMenu) {
        await browser.contextMenus.removeAll();
        createContextMenus();
      } else {
        try {
          await browser.contextMenus.remove('twofas-context-menu');
        } catch {}
      }
    });
};

export default handleContextMenuChange;
