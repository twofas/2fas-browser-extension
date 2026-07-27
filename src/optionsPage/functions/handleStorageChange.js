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

import generateDomainsList from '@optionsPage/functions/generateDomainsList.js';

/**
 * Keeps the options page in sync with storage. The excluded-domains list is
 * rendered straight from storage, so any local change to it (made here or by the
 * background's serialized writer) re-renders the table — this is the single
 * render path, which removes the previous "save then patch DOM" double-render.
 *
 * The devices table is rendered from the API, not storage, so device changes are
 * handled by their own flow and intentionally ignored here.
 *
 * @param {Object} changes - The `browser.storage.onChanged` changes object.
 * @param {string} areaName - The storage area that changed.
 * @returns {void}
 */
const handleStorageChange = (changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes.autoSubmitExcludedDomains) {
    generateDomainsList(changes.autoSubmitExcludedDomains.newValue);
  }
};

export default handleStorageChange;
