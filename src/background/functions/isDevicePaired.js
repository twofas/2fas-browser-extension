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

import syncDevicesWithAPI from '@background/functions/syncDevicesWithAPI.js';
import deviceListHasId from '@partials/deviceListHasId.js';

/**
 * Checks if the device that sent the token is still paired.
 * @async
 * @param {Object} storage - Storage object with extensionID and devices.
 * @param {string} deviceId - The device ID to verify.
 * @returns {Promise<boolean>} True if device exists.
 */
const isDevicePaired = async (storage, deviceId) => {
  // Fresh (throttle-bypassing) sync: this is a security check gating token
  // delivery, so it must not accept a device the throttle cache still lists from
  // up to SYNC_THROTTLE_MS ago after it was unpaired.
  //
  // DELIBERATE fail-open-to-cache: on ANY API failure or offline state,
  // syncDevicesWithAPI returns the caller's storage unchanged (composeResult), so
  // this check falls back to the LOCALLY cached device list rather than withholding
  // the token. This is intentional. The 2FAS backend is the primary enforcement
  // point — it does not route a 2fa_response from an unpaired device — so the local
  // list is defence-in-depth, not the gate. Failing CLOSED here would break every
  // legitimate autofill during a transient network blip, a far worse trade-off than
  // the narrow residual of honouring a device that was unpaired while we were
  // offline. Freshness is therefore best-effort: guaranteed only when the API is
  // reachable, cache-backed otherwise.
  const syncResult = await syncDevicesWithAPI(storage, { fresh: true });
  const devices = syncResult.storage?.devices || [];

  return deviceListHasId(devices, deviceId);
};

export default isDevicePaired;
