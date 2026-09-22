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
import safeConsole from '@partials/safeConsole.js';
import createAsyncThrottle from '@partials/createAsyncThrottle.js';
import { mutateDevices } from '@background/functions/listStore.js';
import reconcileDevices from '@background/functions/reconcileDevices.js';
import isTransportError from '@partials/isTransportError.js';
import { hasApiHostAccess, isApiBlockedByBrowser } from '@partials/apiHostAccess.js';
import { loadFromSessionStorage, removeFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';

// Collapse bursts of sync requests (rapid action triggers, duplicate WebSocket
// responses, concurrent callers) into a single backend request. Without this a
// flaky network turns every retry into another getAllPairedDevices call and
// another error-39 log, which is how a single user can flood the backend.
const SYNC_THROTTLE_MS = 2000;

// storage.session markers for log 76. The log cannot go out while the block lasts:
// store_log goes through the same API with the same headers, so it is held as
// pending and sent by the first sync that succeeds afterwards, once per session.
const BLOCKED_PENDING_KEY = 'apiAccessBlockedPending';
const BLOCKED_REPORTED_KEY = 'apiAccessBlockedReported';

/**
 * Remembers that the browser blocked the device sync, for log 76.
 *
 * @param {Object} err - The SDK-normalized error of the blocked request.
 * @returns {Promise<void>}
 */
const noteBlocked = async err => {
  try {
    const session = await loadFromSessionStorage([BLOCKED_PENDING_KEY, BLOCKED_REPORTED_KEY]);

    if (session?.[BLOCKED_PENDING_KEY] || session?.[BLOCKED_REPORTED_KEY]) {
      return;
    }

    await saveToSessionStorage({ [BLOCKED_PENDING_KEY]: { errorName: String(err?.name || 'Error'), at: Date.now() } });
  } catch (sessionErr) {
    safeConsole.error('syncDevicesWithAPI - noteBlocked', sessionErr);
  }
};

/**
 * Sends a held log 76 now that the API answers again. `hostAccessNow` tells how the
 * block ended: true = the user granted access, false = the API's CORS policy now
 * lets our headers through.
 *
 * @returns {Promise<void>}
 */
const reportBlockAfterRecovery = async () => {
  try {
    const session = await loadFromSessionStorage(BLOCKED_PENDING_KEY);
    const pending = session?.[BLOCKED_PENDING_KEY];

    if (!pending) {
      return;
    }

    await removeFromSessionStorage(BLOCKED_PENDING_KEY);
    await saveToSessionStorage({ [BLOCKED_REPORTED_KEY]: Date.now() });

    const blockedForMinutes = Number.isFinite(pending.at) ? Math.max(0, Math.round((Date.now() - pending.at) / 60000)) : null;

    await storeLog('warning', 76, new Error('API requests were blocked by the browser: no host access, API reachable', {
      cause: { errorName: pending.errorName, blockedForMinutes, hostAccessNow: await hasApiHostAccess() }
    }), 'syncDevicesWithAPI');
  } catch (logErr) {
    safeConsole.error('syncDevicesWithAPI - reportBlockAfterRecovery', logErr);
  }
};

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
 * @param {Object} [options]
 * @param {boolean} [options.diagnose=true] - Tell a browser block from a network
 *   failure (up to two GET /health probes on a transport failure).
 * @returns {Promise<Object>} { devices, hasDevices, devicesChanged, apiError, offline, blocked }
 */
const fetchAndReconcileDevices = async (storage, { diagnose = true } = {}) => {
  const result = {
    devices: null,
    hasDevices: false,
    devicesChanged: false,
    apiError: false,
    offline: false,
    blocked: false
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

    // Not awaited: the first success after a block may be the token-delivery check,
    // which must not wait for a store_log POST. It never rejects.
    reportBlockAfterRecovery();

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
      safeConsole.error('syncDevicesWithAPI', err);

      // A request refused by the browser (CORS without host access) looks exactly
      // like being offline. Tell them apart so the user gets advice that works.
      if (diagnose && await isApiBlockedByBrowser(err)) {
        result.blocked = true;
        await noteBlocked(err);
      }
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
 * @returns {Object} { storage, hasDevices, devicesChanged, apiError, offline, blocked }
 */
const composeResult = (storage, sync) => {
  const base = {
    hasDevices: sync.hasDevices,
    devicesChanged: sync.devicesChanged,
    apiError: sync.apiError,
    offline: sync.offline,
    blocked: sync.blocked
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
 * @param {boolean} [options.diagnose=true] - Tell a browser block apart (flag
 *   `blocked`). Honoured on fresh calls; the throttled path always diagnoses.
 * @returns {Promise<Object>} Object with updated storage, hasDevices flag, devicesChanged flag,
 *   apiError flag (true when the API request failed or returned an unexpected payload),
 *   offline flag (true when no internet connection was detected before the request),
 *   and blocked flag (true when the browser refused the request: no host access, API reachable).
 */
const syncDevicesWithAPI = async (storage, { fresh = false, diagnose = true } = {}) => {
  const sync = fresh
    ? await fetchAndReconcileDevices(storage, { diagnose })
    : await throttledFetchAndReconcile(storage);

  return composeResult(storage, sync);
};

export default syncDevicesWithAPI;
