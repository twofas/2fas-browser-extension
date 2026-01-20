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
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import storeLog from '@partials/storeLog.js';

/**
 * Checks if Safari storage has all required data and regenerates it if missing.
 *
 * @param {Object} browserInfo - The browser information object
 * @returns {Promise<void>}
 */
const checkSafariStorage = async browserInfo => {
  try {
    const storage = await loadFromLocalStorage(null);

    const hasValidStorage =
      storage?.browserInfo &&
      storage?.keys?.publicKey &&
      storage?.keys?.privateKey &&
      storage?.extensionID;

    if (hasValidStorage) {
      return;
    }

    await generateDefaultStorage(browserInfo);
    await openInstallPage();
  } catch (err) {
    storeLog('error', 35, err, 'checkSafariStorage');
  }
};

export default checkSafariStorage;
