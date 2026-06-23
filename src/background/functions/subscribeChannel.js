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

/* global WebSocket */
import config from '@/config.js';
import browser from 'webextension-polyfill';
import { handleConfigurationRequest, handleLoginRequest } from '@background/events/index.js';
import TwoFasNotification from '@notification/index.js';
import closeRequest from '@background/functions/closeRequest.js';
import closeWSChannel from '@background/functions/closeWSChannel.js';
import wsTabChanged from '@background/functions/wsTabChanged.js';
import wsTabClosed from '@background/functions/wsTabClosed.js';
import storeLog from '@partials/storeLog.js';

const WS_TIMEOUT_MS = (1000 * 60 * config.WebSocketTimeout) - 5000;
// Backoff delays for unexpected drops. Length doubles as the max consecutive
// reconnect attempts; the whole sequence shares the single WS_TIMEOUT_MS budget.
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;

/**
 * Creates a WebSocket channel for communication with 2FAS backend.
 * @param {Object} storage - Storage object containing extensionID.
 * @param {number|null} tabID - The tab ID associated with this channel.
 * @param {Object} options - Configuration options for the channel.
 * @returns {Object} Channel object with connect method.
 */
const subscribeChannel = (storage, tabID, options = {}) => {
  const {
    timeout = true,
    login = true,
    requestID = null,
    origin = null,
    notifications = {
      timeout: config.Texts.Error.Timeout
    }
  } = options;

  let timeoutID = null;
  let reconnectTimerID = null;
  let reconnectAttempts = 0;
  let deadline = null;
  let handled = false;
  let listenersAttached = false;
  const channel = { ws: null, closing: false };

  const tabChangedFunc = (tabIDChanged, changeInfo) => wsTabChanged(tabIDChanged, changeInfo, tabID, channel, timeoutID, origin);
  const tabClosedFunc = tabIDChanged => wsTabClosed(tabIDChanged, tabID, channel, timeoutID);

  const cleanupListeners = () => {
    if (listenersAttached) {
      browser.tabs.onRemoved.removeListener(tabClosedFunc);
      browser.tabs.onUpdated.removeListener(tabChangedFunc);
      listenersAttached = false;
    }

    if (timeoutID) {
      clearTimeout(timeoutID);
      timeoutID = null;
    }

    if (reconnectTimerID) {
      clearTimeout(reconnectTimerID);
      reconnectTimerID = null;
    }
  };

  const buildWebSocketURL = () => {
    const baseURL = `${process.env.WS_URL}/browser_extensions/${storage.extensionID}`;

    if (login) {
      return `${baseURL}/2fa_requests/${requestID}`;
    }

    return baseURL;
  };

  // Terminal failure path: the budget elapsed or every reconnect attempt failed.
  // Idempotent via channel.closing so a late onclose/race cannot double-notify.
  const handleFailure = () => {
    if (channel.closing) {
      return;
    }

    closeWSChannel(channel);
    cleanupListeners();
    console.warn('WebSocket closed without a response');

    if (timeout) {
      TwoFasNotification.show(notifications.timeout, tabID);
    } else {
      TwoFasNotification.showWithoutTimeout(notifications.timeout, tabID);
    }

    if (login) {
      closeRequest(tabID, requestID);
    }
  };

  // Called from onclose. Reconnects only when the drop was unexpected (no token
  // handled, not a deliberate close) and the requestID is still within budget —
  // so a transient blip while waiting for the user to approve on their phone no
  // longer wastes the whole timeout. Deliberate closes route here too and just
  // tear down. Backoff resets on a successful onopen.
  const scheduleReconnect = () => {
    if (handled || channel.closing) {
      cleanupListeners();
      return;
    }

    const remaining = deadline - Date.now();

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || remaining <= 0) {
      handleFailure();
      return;
    }

    const delay = Math.min(RECONNECT_BACKOFF_MS[reconnectAttempts], remaining);
    reconnectAttempts += 1;

    reconnectTimerID = setTimeout(() => {
      reconnectTimerID = null;

      if (handled || channel.closing) {
        cleanupListeners();
        return;
      }

      if (deadline - Date.now() <= 0) {
        handleFailure();
        return;
      }

      channel.connect();
    }, delay);
  };

  const handleMessage = async messageEvent => {
    let messageData;

    try {
      messageData = JSON.parse(messageEvent.data);
    } catch (parseError) {
      cleanupListeners();
      await storeLog('error', 13, parseError, 'subscribeChannel JSON parse error');
      return;
    }

    // Every branch below is terminal (it closes the channel). The socket only
    // enters the CLOSING state asynchronously, so buffered duplicate messages
    // can still fire onmessage and re-run handleLoginRequest (re-syncing devices,
    // re-injecting the token). Process the first valid message only.
    if (handled) {
      return;
    }

    handled = true;

    clearTimeout(timeoutID);
    timeoutID = null;

    switch (messageData.event) {
      case 'browser_extensions.pairing.success': {
        handleConfigurationRequest(tabID, messageData);
        closeWSChannel(channel);
        cleanupListeners();
        break;
      }

      case 'browser_extensions.device.2fa_response': {
        handleLoginRequest(tabID, messageData);
        closeWSChannel(channel);
        cleanupListeners();
        break;
      }

      case 'browser_extensions.pairing.failure': {
        await storeLog('error', 12, messageData, 'browser_extensions.pairing.failure');
        TwoFasNotification.show(config.Texts.Error.WebSocket, tabID);
        closeWSChannel(channel);
        cleanupListeners();
        break;
      }

      default: {
        closeWSChannel(channel);
        cleanupListeners();
        await storeLog('error', 13, messageData, 'subscribeChannel event default');
      }
    }
  };

  channel.connect = () => {
    // Set once on the first connect so reconnects share the same overall budget
    // instead of restarting the timeout from scratch on every onopen.
    if (deadline === null) {
      deadline = Date.now() + WS_TIMEOUT_MS;
    }

    const wsURL = buildWebSocketURL();
    channel.ws = new WebSocket(wsURL);

    channel.ws.onopen = () => {
      reconnectAttempts = 0;

      const remaining = deadline - Date.now();

      if (remaining <= 0) {
        handleFailure();
        return;
      }

      if (timeoutID) {
        clearTimeout(timeoutID);
      }
      timeoutID = setTimeout(handleFailure, remaining);

      if (!listenersAttached) {
        browser.tabs.onRemoved.addListener(tabClosedFunc);
        browser.tabs.onUpdated.addListener(tabChangedFunc);
        listenersAttached = true;
      }
    };

    // onerror always precedes onclose, so reconnect is driven from onclose only
    // (a single entry point) to avoid double-scheduling; here we just log.
    channel.ws.onerror = async err => {
      await storeLog('error', 11, err, 'WebSocket channel error');
    };

    channel.ws.onclose = () => {
      scheduleReconnect();
    };

    channel.ws.onmessage = handleMessage;

    return channel;
  };

  return channel;
};

export default subscribeChannel;
