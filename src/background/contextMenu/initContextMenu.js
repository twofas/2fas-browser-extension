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

import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import createContextMenus from './createContextMenus.js';

/**
 * Initializes the context menu based on user settings.
 * @async
 * @return {Promise<void>}
 */
const initContextMenu = async () => {
  let storage;

  try {
    storage = await loadFromLocalStorage(['contextMenu']);

    if (storage.contextMenu === null || storage.contextMenu === true) {
      await createContextMenus();
    }
  } catch (err) {
    // Silently fail - context menu is not critical
  } finally {
    storage = null;
  }
};

export default initContextMenu;
