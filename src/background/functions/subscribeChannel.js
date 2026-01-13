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

const subscribeChannel = (storage, tabID, data = {
  action: true,
  timeout: true,
  login: true,
  requestID: null,
  notifications: {
    timeout: config.Texts.Error.Timeout,
    error: config.Texts.Error.General
  }
}) => {
  return new Promise((resolve, reject) => {
    let timeoutID;
    const channel = {};

    const tabChangedFunc = (tabIDChanged, changeInfo) => wsTabChanged(tabIDChanged, changeInfo, tabID, channel, timeoutID);
    const tabClosedFunc = tabIDChanged => wsTabClosed(tabIDChanged, tabID, channel, timeoutID);

    const cleanupListeners = () => {
      browser.tabs.onRemoved.removeListener(tabClosedFunc);
      browser.tabs.onUpdated.removeListener(tabChangedFunc);
      clearTimeout(timeoutID);
    };

    channel.connect = () => {
      channel.ws = {};

      if (data.login) {
        channel.ws = new WebSocket(`${process.env.WS_URL}/browser_extensions/${storage.extensionID}/2fa_requests/${data.requestID}`);
      } else {
        channel.ws = new WebSocket(`${process.env.WS_URL}/browser_extensions/${storage.extensionID}`);
      }

      channel.ws.onopen = () => {
        timeoutID = setTimeout(() => {
          closeWSChannel(channel);
          console.warn('WebSocket Timeout');
  
          if (data.timeout) {
            TwoFasNotification.show(data.notifications.timeout, tabID);
          } else {
            TwoFasNotification.showWithoutTimeout(data.notifications.timeout, tabID);
          }
  
          if (data.login) {
            closeRequest(tabID, data.requestID);
          }
  
          return reject(new Error('timeout'));
        }, (1000 * 60 * config.WebSocketTimeout) - 5000);
  
        browser.tabs.onRemoved.addListener(tabClosedFunc);
        browser.tabs.onUpdated.addListener(tabChangedFunc);
  
        return true;
      };
  
      channel.ws.onerror = async err => {
        cleanupListeners();

        await storeLog('error', 11, err, 'WebSocket channel error');
        return reject(err);
      };

      channel.ws.onclose = () => {
        cleanupListeners();
      };
  
      channel.ws.onmessage = async message => {
        const data = JSON.parse(message.data);
        clearTimeout(timeoutID);
  
        switch (data.event) {
          case 'browser_extensions.pairing.success': {
            handleConfigurationRequest(tabID, data);
            closeWSChannel(channel);
            cleanupListeners();

            return true;
          }

          case 'browser_extensions.device.2fa_response': {
            handleLoginRequest(tabID, data);
            closeWSChannel(channel);
            cleanupListeners();

            return true;
          }

          case 'browser_extensions.pairing.failure': {
            await storeLog('error', 12, data, 'browser_extensions.pairing.failure');
            TwoFasNotification.show(config.Texts.Error.WebSocket, tabID);
            closeWSChannel(channel);
            cleanupListeners();

            return true;
          }

          default: {
            cleanupListeners();

            await storeLog('error', 13, data, 'subscribeChannel event default');
            throw new Error('Unknown message');
          }
        }
      };

      return channel;
    };

    return resolve(channel);
  });
};

export default subscribeChannel;
