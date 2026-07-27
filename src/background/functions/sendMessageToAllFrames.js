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

/**
 * Sends a message to all frames within a tab, excluding about:blank frames.
 *
 * @param {number} tabId - The ID of the tab to send messages to
 * @param {Object} message - The message object to send
 * @returns {Promise<Array<{frameId: number, url: string, response: *}>|boolean>} A promise that resolves to an
 *   array of per-frame results (each carrying the originating `frameId` and `url`) or false if there are no frames
 */
const sendMessageToAllFrames = async (tabId, message) => {
  let frames;

  try {
    frames = await browser.webNavigation.getAllFrames({ tabId });
  } catch {
    return false;
  }

  if (!frames || frames.length <= 0) {
    return false;
  }

  frames = frames.filter(frame => frame.url && frame.url !== 'about:blank');

  if (!frames || frames.length <= 0) {
    return false;
  }

  const seenFrameIds = new Set();
  frames = frames.filter(frame => {
    if (seenFrameIds.has(frame.frameId)) {
      return false;
    }

    seenFrameIds.add(frame.frameId);
    return true;
  });

  return Promise.all(
    frames.map(frame =>
      browser.tabs
        .sendMessage(tabId, message, { frameId: frame.frameId })
        .then(response => ({ frameId: frame.frameId, url: frame.url, response }))
        .catch(() => ({ frameId: frame.frameId, url: frame.url, response: false }))
    )
  );
};

export default sendMessageToAllFrames;
