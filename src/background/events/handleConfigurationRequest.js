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
import configurationComplete from '@/installPage/functions/configurationComplete.js';
import TwoFasNotification from '@notification/index.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';

/**
 * Checks if a device with the given ID already exists in the devices array.
 * @param {Array} devices - Array of paired devices.
 * @param {string} deviceId - The device ID to check.
 * @returns {boolean} True if device exists.
 */
const deviceExists = (devices, deviceId) => {
  return devices.some(device => device.device_id === deviceId);
};

/**
 * Handles a device pairing configuration request from the mobile app.
 * @param {number} tabID - The tab ID where the pairing request originated.
 * @param {Object} data - The configuration data from the WebSocket.
 * @param {string} data.device_id - The unique device identifier.
 * @param {string} data.device_public_key - The device's public key for encryption.
 * @returns {Promise<void>}
 */
const handleConfigurationRequest = async (tabID, data) => {
  const { device_id, device_public_key } = data; // eslint-disable-line camelcase

  if (!device_id || !device_public_key) { // eslint-disable-line camelcase
    await storeLog('error', 7, new Error('Invalid configuration data'), 'configurationRequest');
    return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
  }

  let storage = null;

  try {
    storage = await loadFromLocalStorage(['configured', 'devices']);

    if (!storage.configured) {
      storage = await saveToLocalStorage({ configured: true }, storage);
    }

    const devices = storage.devices || [];

    if (!deviceExists(devices, device_id)) {
      devices.push({ device_id, device_public_key }); // eslint-disable-line camelcase
      await saveToLocalStorage({ devices }, storage);
    }

    configurationComplete();
  } catch (err) {
    await storeLog('error', 7, err, 'configurationRequest');
    return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
  } finally {
    storage = null;
  }
};

export default handleConfigurationRequest;
