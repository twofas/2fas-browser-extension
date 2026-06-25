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
import resolveTokenTargetFrame from '@background/functions/resolveTokenTargetFrame.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';

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
 * @param {CryptoKey} privateKey - The non-extractable RSA-OAEP private key from IndexedDB.
 * @returns {Promise<string>} The decrypted token.
 */
const decryptToken = async (encryptedToken, privateKey) => {
  const crypt = new Crypt();
  const decrypted = await crypt.decrypt(privateKey, crypt.stringToArrayBuffer(encryptedToken));

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

    const privateKey = await getOrMigratePrivateKey(storage);

    if (!privateKey) {
      throw new Error('Private key not found in storage');
    }

    const token = await decryptToken(data.token, privateKey);
    const loginData = { ...data, token };

    // Deliver the plaintext token only to the frame that held the focused input
    // when the request was initiated (recorded in handleFrontElement) and only
    // while that frame still hosts the same origin. This keeps the decrypted
    // token out of every other frame — notably cross-origin iframes where the
    // 2FAS content script also runs. resolveTokenTargetFrame returns frameId 0
    // (top frame) for a focus-less / legacy request, or null when no frame can be
    // verified to still host the request's origin (the page navigated away).
    const targetFrameId = await resolveTokenTargetFrame(tabID);

    if (targetFrameId === null) {
      // No frame still hosts the origin that initiated the request — the page
      // navigated away. Deliver the plaintext token nowhere (neither inputToken
      // nor the fallback notification, both of which would expose it) and just
      // close the stale backend request.
      await storeLog('warning', 51, new Error('No safe target frame for token delivery'), 'handleLoginRequest');
      return closeRequest(tabID, data.token_request_id);
    }

    const response = await browser.tabs
      .sendMessage(tabID, { action: 'inputToken', ...loginData }, { frameId: targetFrameId })
      .catch(async err => {
        // A failure to reach the specific recorded subframe is worth surfacing
        // (it went away between request and delivery); top-frame failures are the
        // ordinary "no content script on this page" case, so leave those silent.
        if (targetFrameId !== 0) {
          await storeLog('warning', 50, err, 'handleLoginRequest - inputToken delivery to recorded frame failed');
        }

        return false;
      });

    const completed = response?.status === 'completed';

    if (!completed) {
      await browser.tabs.sendMessage(tabID, { action: 'showTokenNotification', token, token_request_id: data.token_request_id }, { frameId: 0 }).catch(() => {});
    }

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
