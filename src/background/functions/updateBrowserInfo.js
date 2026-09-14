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

import { updateBrowserExtension, updateIncognitoAccess, verifyStorageIntegrity } from '@background/functions/update/index.js';

/**
 * Updates browser information by verifying storage, updating extension data, and checking incognito access.
 *
 * @param {Object} browserInfo - The browser information object
 * @returns {Promise<void>} A promise that resolves when all updates are complete
 */
const updateBrowserInfo = browserInfo => {
  return verifyStorageIntegrity(browserInfo)
    .then(valid => {
      if (!valid) {
        return undefined;
      }

      return updateBrowserExtension(browserInfo);
    })
    .then(updateIncognitoAccess)
    // Console only: every step of this chain logs its own failures
    // (verifyStorageIntegrity 29, updateBrowserExtension 48, updateIncognitoAccess),
    // so bucket 6 only ever duplicated one of them with less context.
    .catch(err => console.error('updateBrowserInfo', err));
};

export default updateBrowserInfo;
