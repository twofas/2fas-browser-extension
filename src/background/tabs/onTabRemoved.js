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

import { loadFromLocalStorage } from '@localStorage/index.js';
import { loadFromSessionStorage, removeFromSessionStorage } from '@sessionStorage/index.js';
import storeLog from '@partials/storeLog.js';
import SDK from '@sdk/index.js';

/**
 * Handles tab removal events. Cleans up tab data and closes pending 2FA requests.
 * @async
 * @param {number} tabID - The ID of the removed tab.
 * @return {Promise<void>}
 */
const onTabRemoved = async tabID => {
  let storage = null;
  let sessionData = null;

  try {
    storage = await loadFromLocalStorage(['extensionID']);
    sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
  } catch (err) {
    await storeLog('error', 2, err, sessionData?.[`tabData-${tabID}`]?.url);
    storage = null;
    sessionData = null;
    return;
  }

  if (sessionData?.[`tabData-${tabID}`]?.requestID) {
    await new SDK().close2FARequest(storage.extensionID, sessionData[`tabData-${tabID}`].requestID, false);
  }

  if (sessionData?.[`tabData-${tabID}`]) {
    try {
      await removeFromSessionStorage(`tabData-${tabID}`);
    } catch (err) {
      await storeLog('error', 2, err, sessionData[`tabData-${tabID}`]?.url);
    }
  }

  storage = null;
  sessionData = null;
};

export default onTabRemoved;
