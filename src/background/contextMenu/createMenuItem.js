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

/**
 * Creates one context-menu item and resolves once the browser has processed it.
 * The callback reads runtime.lastError, so a rejected item (e.g. an id that is
 * already registered) is handled here instead of surfacing as "Unchecked
 * runtime.lastError". A context menu is never critical: this never rejects.
 *
 * @param {Object} createProperties - contextMenus.create properties.
 * @returns {Promise<boolean>} true when the item was created.
 */
const createMenuItem = createProperties => new Promise(resolve => {
  try {
    // Reading lastError inside the callback marks it as handled.
    browser.contextMenus.create(createProperties, () => resolve(!browser.runtime.lastError));
  } catch {
    resolve(false);
  }
});

export default createMenuItem;
