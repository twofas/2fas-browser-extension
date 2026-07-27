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

/**
 * Closes a WebSocket channel if the connection is open or still connecting.
 *
 * Marks the channel as deliberately closing so subscribeChannel's onclose/onerror
 * handlers can tell an intentional teardown (timeout, navigation, tab close, token
 * received) apart from an unexpected network drop that should trigger a reconnect.
 *
 * @param {Object} channel - The channel object containing the WebSocket instance
 */
const closeWSChannel = channel => {
  if (!channel) {
    return;
  }

  channel.closing = true;

  if (!channel.ws) {
    return;
  }

  const { readyState } = channel.ws;

  if (readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN) {
    channel.ws.close();
  }
};

export default closeWSChannel;
