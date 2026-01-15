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
import { saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';

/**
 * Syncs local devices storage with the API and returns updated storage.
 *
 * @param {Object} storage - The current local storage data containing extensionID and devices
 * @returns {Promise<Object>} Object with updated storage, hasDevices flag, and devicesChanged flag
 */
const syncDevicesWithAPI = async storage => {
  const result = {
    storage,
    hasDevices: false,
    devicesChanged: false
  };

  if (!storage?.extensionID) {
    return result;
  }

  try {
    const apiDevices = await new SDK().getAllPairedDevices(storage.extensionID);

    if (!Array.isArray(apiDevices)) {
      return result;
    }

    result.hasDevices = apiDevices.length > 0;

    if (!result.hasDevices) {
      if (storage.devices && storage.devices.length > 0) {
        result.devicesChanged = true;
        result.storage = await saveToLocalStorage({ devices: [], configured: false }, storage);
      }

      return result;
    }

    const apiDeviceIds = new Set(apiDevices.map(d => d.id));
    const localDevices = storage.devices || [];
    const localDeviceIds = new Set(localDevices.map(d => d.device_id));

    const devicesToRemove = localDevices.filter(d => !apiDeviceIds.has(d.device_id));
    const hasRemovals = devicesToRemove.length > 0;

    const newApiDevices = apiDevices.filter(d => !localDeviceIds.has(d.id));
    const hasNewDevices = newApiDevices.length > 0;

    if (hasRemovals || hasNewDevices) {
      result.devicesChanged = true;

      const updatedDevices = localDevices.filter(d => apiDeviceIds.has(d.device_id));

      newApiDevices.forEach(apiDevice => {
        updatedDevices.push({
          device_id: apiDevice.id,
          device_public_key: apiDevice.public_key || ''
        });
      });

      result.storage = await saveToLocalStorage({ devices: updatedDevices }, storage);
    }

    return result;
  } catch (err) {
    await storeLog('error', 39, err, 'syncDevicesWithAPI');
    return result;
  }
};

export default syncDevicesWithAPI;
