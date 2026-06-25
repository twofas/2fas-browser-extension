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

/**
 * Reconciles the locally cached devices against the authoritative list from the
 * API. Pure reducer for use inside the `devices` storage lock (`mutateDevices`).
 *
 * Local devices carry only what the extension needs to encrypt tokens
 * (`{ device_id, device_public_key }`); the API returns richer records keyed by
 * `id` with a `public_key`. A new API device is added only when it has a usable
 * `public_key` — an empty key yields a broken record (token encryption can't
 * work, and pairing rejects it too), so it is left out and re-added by a later
 * sync once the key is present.
 *
 * @param {Array<{device_id: string, device_public_key: string}>} [localDevices] - Cached local devices.
 * @param {Array<{id: string, public_key: string}>} apiDevices - Devices from the API.
 * @returns {Array<{device_id: string, device_public_key: string}>|null} The reconciled
 *   list, or `null` when nothing changed (so the caller can skip the write).
 */
const reconcileDevices = (localDevices, apiDevices) => {
  const local = Array.isArray(localDevices) ? localDevices : [];

  if (!Array.isArray(apiDevices) || apiDevices.length === 0) {
    return local.length > 0 ? [] : null;
  }

  const apiDeviceIds = new Set(apiDevices.map(d => d.id));
  const localDeviceIds = new Set(local.map(d => d.device_id));

  const kept = local.filter(d => apiDeviceIds.has(d.device_id));
  const added = apiDevices
    .filter(d => !localDeviceIds.has(d.id) && d.public_key)
    .map(d => ({ device_id: d.id, device_public_key: d.public_key }));

  const hasRemovals = kept.length !== local.length;
  const hasNewDevices = added.length > 0;

  if (!hasRemovals && !hasNewDevices) {
    return null;
  }

  return [...kept, ...added];
};

export default reconcileDevices;
