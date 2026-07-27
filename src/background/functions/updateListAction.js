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

import { mutateDevices, mutateExcludedDomains } from '@background/functions/listStore.js';
import defaultAutoSubmitExcludedDomains from '@/defaultAutoSubmitExcludedDomains.js';
import uniqueOnly from '@partials/uniqueOnly.js';

/**
 * Removes a device from the local cache by id. No-op (skips the write) when the
 * device isn't present.
 * @param {string} deviceId - The device id to remove.
 * @returns {Promise<Object>} `{ list, result }`.
 */
const removeDevice = async deviceId => {
  if (!deviceId) {
    throw new Error('updateList: missing deviceId');
  }

  const result = await mutateDevices(devices => {
    const filtered = devices.filter(d => d.device_id !== deviceId);
    return filtered.length === devices.length ? null : filtered;
  });

  return { list: 'devices', result };
};

/**
 * Adds a domain to the excluded list, de-duplicated. Reports whether it was new.
 * @param {string} value - The (already normalized) domain to add.
 * @returns {Promise<Object>} `{ list, result, added }`.
 */
const addDomain = async value => {
  if (!value) {
    throw new Error('updateList: missing domain value');
  }

  let added = false;

  const result = await mutateExcludedDomains(list => {
    if (list.includes(value)) {
      return null;
    }

    added = true;
    return [...list, value];
  });

  return { list: 'domains', result, added };
};

/**
 * Removes a domain from the excluded list. No-op when it isn't present.
 * @param {string} value - The domain to remove.
 * @returns {Promise<Object>} `{ list, result }`.
 */
const removeDomain = async value => {
  if (!value) {
    throw new Error('updateList: missing domain value');
  }

  const result = await mutateExcludedDomains(list => (list.includes(value) ? list.filter(d => d !== value) : null));

  return { list: 'domains', result };
};

/**
 * Merges the built-in default excluded domains into the current list, uniquely.
 * @returns {Promise<Object>} `{ list, result }`.
 */
const importDefaultDomains = async () => {
  const result = await mutateExcludedDomains(list => [...list, ...defaultAutoSubmitExcludedDomains].filter(uniqueOnly));

  return { list: 'domains', result };
};

/**
 * Single, serialized entry point for mutating the `devices` and
 * `autoSubmitExcludedDomains` storage lists. Every cross-context list write
 * (options page → background) flows through here so it shares one read-modify-write
 * lock with the background's own writers (pairing, device sync). All writes happen
 * in the background; consumers react to `browser.storage.onChanged`.
 *
 * @async
 * @param {Object} request - `{ list, op, value?, deviceId? }`.
 * @param {string} request.list - `'devices'` or `'domains'`.
 * @param {string} request.op - The operation to apply.
 * @returns {Promise<Object>} The result of the mutation, including the new list.
 * @throws {Error} When the list or op is unknown, or a required field is missing.
 */
const handleUpdateList = async request => {
  const { list, op } = request || {};

  if (list === 'devices') {
    switch (op) {
      case 'remove':
        return removeDevice(request.deviceId);
      default:
        throw new Error(`updateList: unknown devices op "${op}"`);
    }
  }

  if (list === 'domains') {
    switch (op) {
      case 'add':
        return addDomain(request.value);
      case 'remove':
        return removeDomain(request.value);
      case 'importDefaults':
        return importDefaultDomains();
      default:
        throw new Error(`updateList: unknown domains op "${op}"`);
    }
  }

  throw new Error(`updateList: unknown list "${list}"`);
};

export default handleUpdateList;
