//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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
const config = require('../../config');
const browser = require('webextension-polyfill');
const { handleConfigurationRequest, handleLoginRequest } = require('../events');
const TwoFasNotification = require('../../notification');
const closeRequest = require('./closeRequest');
const closeWSChannel = require('./closeWSChannel');
const wsTabChanged = require('./wsTabChanged');
const storeLog = require('../../partials/storeLog');

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
    const tabFunc = (tabIDChanged, changeInfo) => wsTabChanged(tabIDChanged, changeInfo, tabID, channel, timeoutID);

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
        }, (1000 * 60 * config.WebSocketTimeout) - 100);
  
        browser.tabs.onRemoved.addListener(tabFunc);
        browser.tabs.onUpdated.addListener(tabFunc);
  
        return true;
      }
  
      channel.ws.onerror = async err => {
        browser.tabs.onRemoved.removeListener(tabFunc);
        browser.tabs.onUpdated.removeListener(tabFunc);
        clearTimeout(timeoutID);
        
        await storeLog('error', 11, err, 'WebSocket channel error');
        return reject(err);
      }
  
      channel.ws.onclose = reason => {
        browser.tabs.onRemoved.removeListener(tabFunc);
        browser.tabs.onUpdated.removeListener(tabFunc);
        clearTimeout(timeoutID);
      }
  
      channel.ws.onmessage = async message => {
        const data = JSON.parse(message.data);
  
        switch (data.event) {
          case 'browser_extensions.pairing.success': {
            handleConfigurationRequest(tabID, data);
            closeWSChannel(channel);
  
            browser.tabs.onRemoved.removeListener(tabFunc);
            browser.tabs.onUpdated.removeListener(tabFunc);
            clearTimeout(timeoutID);
  
            return true;
          }
  
          case 'browser_extensions.device.2fa_response': {
            handleLoginRequest(tabID, data);
            closeWSChannel(channel);
  
            browser.tabs.onRemoved.removeListener(tabFunc);
            browser.tabs.onUpdated.removeListener(tabFunc);
            clearTimeout(timeoutID);
  
            return true;
          }
  
          case 'browser_extensions.pairing.failure': {
            await storeLog('error', 12, data, 'browser_extensions.pairing.failure');
            TwoFasNotification.show(config.Texts.Error.WebSocket, tabID);
  
            closeWSChannel(channel);
  
            browser.tabs.onRemoved.removeListener(tabFunc);
            browser.tabs.onUpdated.removeListener(tabFunc);
            clearTimeout(timeoutID);
  
            return true;
          }
  
          default: {
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

module.exports = subscribeChannel;
