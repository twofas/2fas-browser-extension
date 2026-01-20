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

const PING_INTERVAL_MS = 10000;

/**
 * Establishes and maintains a persistent connection to the background script.
 * Automatically reconnects when the port disconnects (e.g., service worker restart).
 */
const portSetup = () => {
  let isConnected = false;
  let pingTimeoutId = null;

  const sendPing = port => {
    if (!isConnected) {
      return;
    }

    try {
      port.postMessage({ msg: 'ping' });
    } catch {
      isConnected = false;
    }
  };

  const handleMessage = port => {
    pingTimeoutId = setTimeout(() => sendPing(port), PING_INTERVAL_MS);
  };

  const connect = () => {
    if (!browser?.runtime?.id) {
      return;
    }

    const port = browser.runtime.connect({ name: '2FAS' });
    isConnected = true;

    const onMessage = () => handleMessage(port);

    const onDisconnect = () => {
      isConnected = false;

      if (pingTimeoutId !== null) {
        clearTimeout(pingTimeoutId);
        pingTimeoutId = null;
      }

      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);

      connect();
    };

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);

    sendPing(port);
  };

  connect();
};

export default portSetup;
