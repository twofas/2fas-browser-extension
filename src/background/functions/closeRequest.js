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

import SDK from '@sdk/index.js';
import { loadFromLocalStorage } from '@localStorage/index.js';
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';
import storeLog from '@partials/storeLog.js';

/**
 * Closes a 2FA request for a specific tab.
 * @async
 * @param {number} tabID - The tab ID.
 * @param {string} requestID - The request ID to close.
 * @return {Promise<boolean|void>}
 */
const closeRequest = async (tabID, requestID) => {
  let storage = null;
  let sessionData = null;

  try {
    storage = await loadFromLocalStorage(['extensionID']);
    sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
  } catch (err) {
    await storeLog('error', 30, err);
    storage = null;
    sessionData = null;
    return false;
  }

  if (!sessionData?.[`tabData-${tabID}`]?.requestID || requestID !== sessionData[`tabData-${tabID}`]?.requestID) {
    storage = null;
    sessionData = null;
    return false;
  }

  try {
    await new SDK().close2FARequest(storage.extensionID, sessionData[`tabData-${tabID}`].requestID, true);

    const tabObject = structuredClone(sessionData[`tabData-${tabID}`]);
    delete tabObject.requestID;

    await saveToSessionStorage({ [`tabData-${tabID}`]: tabObject });
  } catch (err) {
    await storeLog('error', 30, err, sessionData[`tabData-${tabID}`]?.url);
  } finally {
    storage = null;
    sessionData = null;
  }
};

export default closeRequest;
