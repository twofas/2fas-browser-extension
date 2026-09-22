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

import config from '@/config.js';
import SDK from '@sdk/index.js';
import storeLog from '@partials/storeLog.js';
import isTransportError from '@partials/isTransportError.js';
import { isApiBlockedByBrowser } from '@partials/apiHostAccess.js';

/**
 * Loads the paired devices for the options page. The devices table is API-sourced,
 * so a failure is reported as a reason the page can explain: 'offline', 'blocked'
 * (the browser refused the request: no host access, API reachable) or 'apiError'.
 *
 * @param {string} extensionID - The extension ID.
 * @returns {Promise<{devices: ?Object[], errorReason: ?('offline'|'blocked'|'apiError')}>}
 */
const loadDevicesList = async extensionID => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { devices: null, errorReason: 'offline' };
  }

  try {
    const apiResponse = await new SDK().getAllPairedDevices(extensionID);

    if (Array.isArray(apiResponse)) {
      return { devices: apiResponse, errorReason: null };
    }

    return { devices: null, errorReason: 'apiError' };
  } catch (err) {
    if (!isTransportError(err)) {
      await storeLog('error', 21, err, 'optionsPage:getAllPairedDevices');
    }

    return { devices: null, errorReason: (await isApiBlockedByBrowser(err)) ? 'blocked' : 'apiError' };
  }
};

/**
 * The notification that explains a devices-list failure. None for 'blocked': the
 * full-page overlay (showApiBlockedOverlay) explains it, while
 * Texts.Error.ApiAccessBlocked sends the user to the options page they are on.
 *
 * @param {('offline'|'blocked'|'apiError')} reason - From loadDevicesList.
 * @returns {?Object} A config.Texts.Error entry, or null for no notification.
 */
const devicesErrorNotification = reason => {
  if (reason === 'offline') {
    return config.Texts.Error.NoInternet;
  }

  if (reason === 'blocked') {
    return null;
  }

  return config.Texts.Error.DevicesUnavailable;
};

export default loadDevicesList;
export { devicesErrorNotification };
