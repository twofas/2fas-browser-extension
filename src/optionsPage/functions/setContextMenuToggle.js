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

import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage';

/**
 * Initializes the context menu toggle switch with stored value.
 *
 * @returns {Promise<void>} A promise that resolves when the toggle is initialized
 */
const setContextMenuToggle = () => {
  return loadFromLocalStorage(['contextMenu'])
    .then(storage => {
      if (!('contextMenu' in storage)) {
        return saveToLocalStorage({ contextMenu: true }, storage);
      }

      return storage;
    })
    .then(storage => {
      const contextMenuToggle = document.querySelector('input#twofas-context-menu');

      if (contextMenuToggle) {
        contextMenuToggle.checked = storage.contextMenu;
      }

      return Promise.resolve();
    })
    .catch(() => {});
};

export default setContextMenuToggle;
