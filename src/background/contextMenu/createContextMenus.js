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
import createMenuItem from './createMenuItem.js';

// Every call rebuilds the menus from scratch, one call after another. The
// background calls this at load and again from onStartup/onInstalled; run side
// by side, the two removeAll()s finished before either create(), and the second
// create failed with "Identifier is already used" on every browser start.
let queue = Promise.resolve();

/**
 * Removes the extension's context menu items and creates them again.
 * @return {Promise<void>}
 */
const rebuildContextMenus = async () => {
  let storage;

  try {
    storage = await loadFromLocalStorage(['contextMenu']);

    if (!('contextMenu' in storage)) {
      storage = await saveToLocalStorage({ contextMenu: true }, storage);
    }

    // From scratch, the Firefox options item included.
    await browser.contextMenus.removeAll();

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

      await createMenuItem(options);
    }

    await createFirefoxOptionsMenu();
  } catch (err) {
    // Silently fail - context menu is not critical
  } finally {
    storage = null;
  }
};

/**
 * Creates context menu items for the extension. Calls are queued, so overlapping
 * callers never interleave removeAll() and create().
 * @return {Promise<void>}
 */
const createContextMenus = () => {
  queue = queue.then(rebuildContextMenus, rebuildContextMenus);

  return queue;
};

export default createContextMenus;
