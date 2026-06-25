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
import storeLog from '@partials/storeLog.js';
import createAsyncThrottle from '@partials/createAsyncThrottle.js';
import { mutateDevices } from '@background/functions/listStore.js';
import reconcileDevices from '@background/functions/reconcileDevices.js';

// Collapse bursts of sync requests (rapid action triggers, duplicate WebSocket
// responses, concurrent callers) into a single backend request. Without this a
// flaky network turns every retry into another getAllPairedDevices call and
// another error-39 log, which is how a single user can flood the backend.
const SYNC_THROTTLE_MS = 2000;

/**
 * Syncs local devices storage with the API and returns updated storage.
 *
 * @param {Object} storage - The current local storage data containing extensionID and devices
 * @returns {Promise<Object>} Object with updated storage, hasDevices flag, devicesChanged flag,
 *   apiError flag (true when the API request failed or returned an unexpected payload),
 *   and offline flag (true when no internet connection was detected before the request).
 */
const performSyncDevicesWithAPI = async storage => {
  const result = {
    storage,
    hasDevices: false,
    devicesChanged: false,
    apiError: false,
    offline: false
  };

  if (!storage?.extensionID) {
    return result;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    result.offline = true;
    result.apiError = true;
    return result;
  }

  try {
    const apiDevices = await new SDK().getAllPairedDevices(storage.extensionID);

    if (!Array.isArray(apiDevices)) {
      result.apiError = true;
      return result;
    }

    // Reconcile inside the devices lock: mutateDevices re-reads the cache and
    // derives `configured` so a concurrent pairing or an options-page removal
    // can't be clobbered by this sync's write. reconcileDevices returns null when
    // nothing changed, which mutateDevices treats as a no-op (no write).
    let changed = false;

    const devices = await mutateDevices(localDevices => {
      const reconciled = reconcileDevices(localDevices, apiDevices);
      changed = reconciled !== null;
      return reconciled;
    });

    // Base hasDevices on the devices actually stored after reconciliation, not on
    // the raw API count: a list of only empty-public_key devices reconciles to none
    // usable, and must route to the install page rather than a configured action.
    result.hasDevices = devices.length > 0;
    result.devicesChanged = changed;
    result.storage = { ...storage, devices, configured: devices.length > 0 };

    return result;
  } catch (err) {
    await storeLog('error', 39, err, 'syncDevicesWithAPI');
    result.apiError = true;
    return result;
  }
};

const syncDevicesWithAPI = createAsyncThrottle(performSyncDevicesWithAPI, {
  windowMs: SYNC_THROTTLE_MS,
  keyFn: storage => storage?.extensionID || 'default'
});

export default syncDevicesWithAPI;
