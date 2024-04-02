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

const browser = require('webextension-polyfill');

const sendMessageToAllFrames = async (tabId, message) => {
  const frames = await browser.webNavigation.getAllFrames({ tabId });

  return Promise.all(frames.map(frame => {
    return browser.tabs.sendMessage(tabId, message, { frameId: frame.frameId }).catch(() => Promise.resolve(false));
  })).then(res => {
    return res.map(frame => {
      if (!frame) {
        return false;
      }

      switch (frame?.status) {
        case 'activeElement': {
          return frame;
        }
  
        default: {
          return false;
        }
      }
    });
  }).catch(() => false);
};

module.exports = sendMessageToAllFrames;
