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
import { startKeepAlive, stopKeepAlive } from '@background/functions/keepAlive.js';
import wsTabChanged from '@background/functions/wsTabChanged.js';
import wsTabClosed from '@background/functions/wsTabClosed.js';
import storeLog from '@partials/storeLog.js';

const WS_TIMEOUT_MS = (1000 * 60 * config.WebSocketTimeout) - 5000;
// Backoff delays for unexpected drops. Length doubles as the max consecutive
// reconnect attempts; the whole sequence shares the single WS_TIMEOUT_MS budget.
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_MS.length;
// A connection must stay open at least this long to count as "stable" and reset the
// consecutive-attempt counter. Without this gate a server that accepts then instantly
// drops the socket (accept-then-drop) would reset the counter on every onopen and
// reconnect forever within the budget, never hitting MAX_RECONNECT_ATTEMPTS.
const STABLE_CONNECTION_MS = 5000;

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
  let connectionOpenedAt = null;
  let deadline = null;
  let handled = false;
  let listenersAttached = false;
  // This channel's hold on the (ref-counted) keep-alive. cleanupListeners can run
  // more than once per channel (e.g. message handled, then a late onclose), so the
  // release is gated to exactly one stopKeepAlive() call — otherwise a single
  // channel would decrement the shared count twice and starve a concurrent request.
  let keepAliveActive = false;
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

    // Single teardown point for every terminal path (token handled, failure,
    // deliberate close) — release this channel's hold on the keep-alive so the
    // worker can suspend. Exactly once per channel (see keepAliveActive), and
    // never on the reconnect backoff path, so the keep-alive correctly persists
    // across transient drops and across other concurrent requests.
    if (keepAliveActive) {
      keepAliveActive = false;
      stopKeepAlive();
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

    // Reset the consecutive-attempt counter only when the connection we just lost
    // had been stable (open ≥ STABLE_CONNECTION_MS). An accept-then-drop server
    // keeps connectionOpenedAt recent, so attempts keep accumulating toward the
    // MAX cap instead of resetting every cycle.
    if (connectionOpenedAt !== null && Date.now() - connectionOpenedAt >= STABLE_CONNECTION_MS) {
      reconnectAttempts = 0;
    }
    connectionOpenedAt = null;

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
      // A single malformed frame is not a terminal event. Previously this ran
      // cleanupListeners() — releasing the keep-alive and clearing the timeout —
      // while leaving the socket OPEN: an unmonitored, un-kept-alive channel. Just
      // skip the bad frame; the socket, its timeout and the keep-alive stay intact
      // so a subsequent valid frame is still handled within the request budget.
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
        // Info: the backend rejected a pairing the user started (expired QR,
        // declined on the phone). Nothing for the team to fix; kept because the
        // ratio of failures to successes is a real product signal.
        await storeLog('info', 12, messageData, 'browser_extensions.pairing.failure');
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
      // Hold the MV3 worker warm for the whole pending-request window. Bounded to
      // the WS budget so a hard SW eviction can't leave the keep-alive running.
      keepAliveActive = true;
      startKeepAlive(WS_TIMEOUT_MS);
    }

    // Detach the previous socket's handlers before replacing it on reconnect, so a
    // late onclose/onerror from the discarded socket can't fire stale closures
    // (scheduleReconnect/storeLog) against this channel.
    if (channel.ws) {
      channel.ws.onopen = null;
      channel.ws.onerror = null;
      channel.ws.onclose = null;
      channel.ws.onmessage = null;
    }

    const wsURL = buildWebSocketURL();

    try {
      channel.ws = new WebSocket(wsURL);
    } catch (err) {
      // The constructor threw before any handler was attached (bad URL, CSP block,
      // resource exhaustion): nothing will ever fire onclose/onerror to release the
      // keep-alive, so tear down here instead of leaking it until the backstop
      // deadline. handleFailure is idempotent (channel.closing) and closeWSChannel
      // tolerates a null socket.
      channel.ws = null;
      storeLog('error', 11, err, 'WebSocket construction failed');
      handleFailure();
      return channel;
    }

    channel.ws.onopen = () => {
      // Record when the socket opened; scheduleReconnect uses this to decide
      // whether the connection was stable enough to reset the attempt counter.
      // (Resetting unconditionally here let accept-then-drop bypass the cap.)
      connectionOpenedAt = Date.now();

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
    channel.ws.onerror = err => {
      // Console only. A WebSocket error Event carries no diagnostics by spec (no
      // type/code/reason worth sending), and every cause is outside the extension:
      // flaky Wi-Fi, captive portal, corporate proxy, offline. Reconnect is driven
      // from onclose, so the entry changed nothing but the noise floor. The
      // constructor-threw case above still logs 11 — that one IS ours (bad URL/CSP).
      console.error('subscribeChannel - WebSocket channel error', err);
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
