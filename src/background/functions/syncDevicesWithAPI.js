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
import isTransportError from '@partials/isTransportError.js';

// Collapse bursts of sync requests (rapid action triggers, duplicate WebSocket
// responses, concurrent callers) into a single backend request. Without this a
// flaky network turns every retry into another getAllPairedDevices call and
// another error-39 log, which is how a single user can flood the backend.
const SYNC_THROTTLE_MS = 2000;

/**
 * Fetches the API device list and reconciles it into the cache. Returns ONLY the
 * API/reconcile-derived facts — deliberately storage-shape-independent (it bakes in
 * no caller storage), so the throttle can cache one result per extensionID and hand
 * it to callers passing different storage shapes without leaking one caller's shape
 * to another (that was the throttle-cache bug). `devices === null` marks "no
 * reconcile happened" (no extensionID / offline / API error) so the composer keeps
 * the caller's storage untouched.
 *
 * @param {Object} storage - Current local storage; only `extensionID` is read here.
 * @returns {Promise<Object>} { devices, hasDevices, devicesChanged, apiError, offline }
 */
const fetchAndReconcileDevices = async storage => {
  const result = {
    devices: null,
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
    result.devices = devices;
    result.hasDevices = devices.length > 0;
    result.devicesChanged = changed;

    return result;
  } catch (err) {
    // Offline is short-circuited above, but a captive portal, VPN, DNS failure or
    // a 2FAS outage still lands here — environment, not a defect. `result.apiError`
    // already drives the "devices unavailable" UI. Anything else (a shape/logic
    // error from reconcileDevices) is ours and still reported.
    if (!isTransportError(err)) {
      // 72, not 39: the catalogue documents 39 as a retired content-script code, so
      // every device-sync failure landed in a bucket nobody was watching.
      await storeLog('error', 72, err, 'syncDevicesWithAPI');
    } else {
      console.error('syncDevicesWithAPI', err);
    }
    result.apiError = true;
    return result;
  }
};

const throttledFetchAndReconcile = createAsyncThrottle(fetchAndReconcileDevices, {
  windowMs: SYNC_THROTTLE_MS,
  keyFn: storage => storage?.extensionID || 'default'
});

/**
 * Composes the caller-facing result, merging the API-derived facts onto the
 * CALLER'S storage shape (never a cached one).
 *
 * @param {Object} storage - The caller's storage.
 * @param {Object} sync - Output of fetchAndReconcileDevices.
 * @returns {Object} { storage, hasDevices, devicesChanged, apiError, offline }
 */
const composeResult = (storage, sync) => {
  const base = {
    hasDevices: sync.hasDevices,
    devicesChanged: sync.devicesChanged,
    apiError: sync.apiError,
    offline: sync.offline
  };

  if (sync.devices === null) {
    // No reconcile ran (no extensionID / offline / API error): keep caller storage.
    return { ...base, storage };
  }

  return { ...base, storage: { ...storage, devices: sync.devices, configured: sync.devices.length > 0 } };
};

/**
 * Syncs local devices storage with the API and returns updated storage.
 *
 * @param {Object} storage - The current local storage data containing extensionID and devices
 * @param {Object} [options]
 * @param {boolean} [options.fresh=false] - Bypass the throttle and always hit the API.
 *   Used by the token-delivery pairing check, where a ≤2s-stale cache could accept a
 *   token from a device unpaired moments earlier — a security check must be fresh.
 * @returns {Promise<Object>} Object with updated storage, hasDevices flag, devicesChanged flag,
 *   apiError flag (true when the API request failed or returned an unexpected payload),
 *   and offline flag (true when no internet connection was detected before the request).
 */
const syncDevicesWithAPI = async (storage, { fresh = false } = {}) => {
  const sync = fresh
    ? await fetchAndReconcileDevices(storage)
    : await throttledFetchAndReconcile(storage);

  return composeResult(storage, sync);
};

export default syncDevicesWithAPI;
