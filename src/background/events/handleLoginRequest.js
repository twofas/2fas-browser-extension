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
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import storeLog from '@partials/storeLog.js';
import resolveTokenTargetFrame from '@background/functions/resolveTokenTargetFrame.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import isTabError from '@background/functions/isTabError.js';
import reportMissingPrivateKey from '@background/functions/reportMissingPrivateKey.js';
import decryptToken from '@background/functions/decryptToken.js';
import isDevicePaired from '@background/functions/isDevicePaired.js';
import deliverTokenNotificationFallback from '@background/functions/deliverTokenNotificationFallback.js';

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
      // Permanent broken state (key lost while registration stays valid) — not a
      // per-request failure. Route into the deduped log-57 reporter instead of
      // flooding bucket 8 on every token request, and show the actionable re-pair
      // notification here (per request — the user actively awaited this token)
      // rather than the reporter's once-per-incident one.
      await reportMissingPrivateKey(storage, 'handleLoginRequest', { notify: false });
      await closeRequest(tabID, data.token_request_id);

      return TwoFasNotification.show(config.Texts.Error.StorageIntegrity, tabID);
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

    let completed = false;

    if (targetFrameId !== null) {
      // A safe target frame exists — attempt the autofill there.
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

      completed = response?.status === 'completed';
    }

    // Whenever the token wasn't autofilled — no safe target frame (the recorded
    // sub-frame navigated away, Z2), or the fill did not complete — surface the
    // token so the user can copy it, but only after re-validating the top frame
    // (Z1); an unsafe top frame drops the token (silently after a post-login
    // redirect, with an "Outdated request" notification for a superseded request).
    if (!completed) {
      await deliverTokenNotificationFallback(tabID, token, data.token_request_id);
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
