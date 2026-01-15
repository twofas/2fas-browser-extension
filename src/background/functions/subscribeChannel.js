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
    notifications = {
      timeout: config.Texts.Error.Timeout,
      error: config.Texts.Error.General
    }
  } = options;

  let timeoutID = null;
  const channel = { ws: null };

  const tabChangedFunc = (tabIDChanged, changeInfo) => wsTabChanged(tabIDChanged, changeInfo, tabID, channel, timeoutID);
  const tabClosedFunc = tabIDChanged => wsTabClosed(tabIDChanged, tabID, channel, timeoutID);

  const cleanupListeners = () => {
    browser.tabs.onRemoved.removeListener(tabClosedFunc);
    browser.tabs.onUpdated.removeListener(tabChangedFunc);

    if (timeoutID) {
      clearTimeout(timeoutID);
      timeoutID = null;
    }
  };

  const buildWebSocketURL = () => {
    const baseURL = `${process.env.WS_URL}/browser_extensions/${storage.extensionID}`;

    if (login) {
      return `${baseURL}/2fa_requests/${requestID}`;
    }

    return baseURL;
  };

  const handleTimeout = () => {
    closeWSChannel(channel);
    console.warn('WebSocket Timeout');

    if (timeout) {
      TwoFasNotification.show(notifications.timeout, tabID);
    } else {
      TwoFasNotification.showWithoutTimeout(notifications.timeout, tabID);
    }

    if (login) {
      closeRequest(tabID, requestID);
    }
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
    const wsURL = buildWebSocketURL();
    channel.ws = new WebSocket(wsURL);

    channel.ws.onopen = () => {
      timeoutID = setTimeout(handleTimeout, WS_TIMEOUT_MS);
      browser.tabs.onRemoved.addListener(tabClosedFunc);
      browser.tabs.onUpdated.addListener(tabChangedFunc);
    };

    channel.ws.onerror = async err => {
      cleanupListeners();
      await storeLog('error', 11, err, 'WebSocket channel error');
    };

    channel.ws.onclose = () => {
      cleanupListeners();
    };

    channel.ws.onmessage = handleMessage;

    return channel;
  };

  return channel;
};

export default subscribeChannel;
