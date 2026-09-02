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
import selfHealMissingPrivateKey, { HEAL_KEY_PRESENT, HEAL_REGENERATED, RECHECK_DELAY_MS } from '@background/functions/selfHealMissingPrivateKey.js';
import decryptToken from '@background/functions/decryptToken.js';
import isDevicePaired from '@background/functions/isDevicePaired.js';
import deliverTokenNotificationFallback from '@background/functions/deliverTokenNotificationFallback.js';
import isTransportError from '@partials/isTransportError.js';
import wait from '@partials/wait.js';

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

    let privateKey = await getOrMigratePrivateKey(storage);
    let identityChanged = false;

    if (!privateKey) {
      // Re-read once before doing anything irreversible. A concurrent regeneration
      // (a storageReset, another heal) leaves a brief window with no key, and this
      // check must happen while the request is still OPEN: closeRequest retires the
      // requestID the content script validates `inputToken` against, so a token that
      // turns out to be decryptable could no longer be autofilled afterwards.
      await wait(RECHECK_DELAY_MS);

      const retried = await loadFromLocalStorage(['keys', 'extensionID', 'devices']);

      // Only a key belonging to the SAME identity can decrypt this token — a
      // regeneration that completed in the meantime minted a keypair the phone has
      // never seen, so its key would only fail at decryptToken.
      identityChanged = Boolean(retried?.keys?.publicKey) && retried.keys.publicKey !== storage?.keys?.publicKey;

      if (!identityChanged) {
        const retriedKey = await getOrMigratePrivateKey(retried);

        if (retriedKey) {
          storage = retried;
          privateKey = retriedKey;
        }
      }
    }

    if (!privateKey) {
      // Permanent broken state (key lost while registration stays valid) — not a
      // per-request failure. Close the request now: it needs the CURRENT extensionID
      // and signing key, both replaced by a self-heal.
      await closeRequest(tabID, data.token_request_id);

      if (identityChanged) {
        // The extension was reset while this token was in flight. Storage is healthy,
        // so nothing to report — the token is simply undecryptable and the device has
        // to be paired with the new identity.
        return TwoFasNotification.show(config.Texts.Error.StorageRecovered, tabID);
      }

      // Regenerate + open the install page on every platform: the user actively
      // awaited this token, so the same "user is waiting" rule as the pre-flight check
      // in browserAction applies (the background integrity check stays report-only
      // outside Safari). The tab gets the "data lost, pair again" notification.
      const outcome = await selfHealMissingPrivateKey(storage, 'handleLoginRequest', { userInitiated: true });

      if (outcome === HEAL_REGENERATED) {
        return TwoFasNotification.show(config.Texts.Error.StorageRecovered, tabID);
      }

      if (outcome === HEAL_KEY_PRESENT) {
        // The heal's own re-read found the key after ours did not. The request is
        // already closed, so this token cannot be filled — ask for a fresh one rather
        // than reporting a broken install that is not broken.
        return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
      }

      // Not healed (every platform but Safari): route into the deduped log-57 reporter
      // instead of flooding bucket 8 on every token request, and show the actionable
      // re-pair notification here (per request) rather than the reporter's
      // once-per-incident one.
      await reportMissingPrivateKey(storage, 'handleLoginRequest', { notify: false });

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

    if (!isTransportError(err)) {
      await storeLog('error', 8, err, 'handleLoginRequest');
    }
    return TwoFasNotification.show(config.Texts.Error.UndefinedError, tabID);
  } finally {
    storage = null;
  }
};

export default handleLoginRequest;
