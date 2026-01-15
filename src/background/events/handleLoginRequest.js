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

import browser from 'webextension-polyfill';
import config from '@/config.js';
import closeRequest from '@background/functions/closeRequest.js';
import TwoFasNotification from '@notification/index.js';
import Crypt from '@background/functions/Crypt.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import syncDevicesWithAPI from '@background/functions/syncDevicesWithAPI.js';
import storeLog from '@partials/storeLog.js';
import sendMessageToTab from '@partials/sendMessageToTab.js';

/**
 * Checks if an error indicates a missing or invalid tab.
 * @param {Error} err - The error to check.
 * @returns {boolean} True if the error indicates a tab issue.
 */
const isTabError = err => {
  const message = err?.message || '';
  return message.includes('No tab with id') || message.includes('Invalid tab ID');
};

/**
 * Decrypts an encrypted 2FA token using the extension's private key.
 * @param {string} encryptedToken - The encrypted token from the mobile app.
 * @param {string} privateKeyString - The private key as a base64 string.
 * @returns {Promise<string>} The decrypted token.
 */
const decryptToken = async (encryptedToken, privateKeyString) => {
  const crypt = new Crypt();
  const privateKey = crypt.stringToArrayBuffer(privateKeyString);
  const key = await crypt.importKey(privateKey, 'pkcs8', ['decrypt']);
  const decrypted = await crypt.decrypt(key, crypt.stringToArrayBuffer(encryptedToken));

  return crypt.decodeText(decrypted);
};

/**
 * Checks if the device that sent the token is still paired.
 * @param {Object} storage - Storage object with extensionID and devices.
 * @param {string} deviceId - The device ID to verify.
 * @returns {Promise<boolean>} True if device exists.
 */
const isDevicePaired = async (storage, deviceId) => {
  const syncResult = await syncDevicesWithAPI(storage);
  const devices = syncResult.storage?.devices || [];

  return devices.some(device => device.device_id === deviceId);
};

/**
 * Handles a 2FA login request by decrypting the token and sending it to the content script.
 * @param {number} tabID - The tab ID where the 2FA request originated.
 * @param {Object} data - The login request data from the WebSocket.
 * @param {string} data.token - The encrypted 2FA token.
 * @param {string} data.token_request_id - The request ID for closing the request.
 * @param {string} data.device_id - The device ID that sent the token.
 * @returns {Promise<void>}
 */
const handleLoginRequest = async (tabID, data) => {
  if (!data?.token || !data?.token_request_id) {
    await storeLog('error', 8, new Error('Invalid login request data'), 'handleLoginRequest');
    return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
  }

  let storage = null;

  try {
    await browser.tabs.get(tabID);

    storage = await loadFromLocalStorage(['keys', 'extensionID', 'devices']);

    if (data.device_id) {
      const devicePaired = await isDevicePaired(storage, data.device_id);

      if (!devicePaired) {
        await closeRequest(tabID, data.token_request_id);
        return TwoFasNotification.show(config.Texts.Error.DeviceUnpaired, tabID);
      }
    }

    if (!storage?.keys?.privateKey) {
      throw new Error('Private key not found in storage');
    }

    const token = await decryptToken(data.token, storage.keys.privateKey);
    const loginData = { ...data, token };

    await sendMessageToTab(tabID, { action: 'inputToken', ...loginData });
    await closeRequest(tabID, data.token_request_id);
  } catch (err) {
    if (isTabError(err)) {
      await closeRequest(tabID, data.token_request_id);
      return TwoFasNotification.show(config.Texts.Error.LackOfTab, tabID);
    }

    await storeLog('error', 8, err, 'handleLoginRequest');
    return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
  } finally {
    storage = null;
  }
};

export default handleLoginRequest;
