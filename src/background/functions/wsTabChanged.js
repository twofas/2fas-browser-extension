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

import closeWSChannel from '@background/functions/closeWSChannel.js';

/**
 * Handles tab URL change event and closes WebSocket channel if the associated tab navigated.
 *
 * @param {number} tabIDChanged - The ID of the tab that changed
 * @param {Object} changeInfo - The change information object from the browser
 * @param {number} tabIDws - The ID of the tab associated with the WebSocket
 * @param {Object} channel - The WebSocket channel object
 * @param {number} timeoutID - The timeout ID to clear
 * @returns {boolean|void} Returns false if change is not relevant
 */
const wsTabChanged = (tabIDChanged, changeInfo, tabIDws, channel, timeoutID) => {
  if (!changeInfo.url || !changeInfo.status === 'complete' || !changeInfo.status === 'loading') {
    return false;
  }

  if (tabIDChanged === tabIDws) {
    clearTimeout(timeoutID);
    closeWSChannel(channel);
  }
};

export default wsTabChanged;
