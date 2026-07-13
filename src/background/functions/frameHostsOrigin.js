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
import storeLog from '@partials/storeLog.js';
import isUsableOrigin from '@background/functions/isUsableOrigin.js';
import getOrigin from '@partials/getOrigin.js';

/**
 * Whether a frame currently hosts `expectedOrigin`. Looks up the frame's live URL
 * via webNavigation and compares origins; any doubt (removed frame, opaque/changed
 * origin, lookup error) resolves to false so the caller does not deliver there.
 *
 * @async
 * @param {number} tabID - The tab to look the frame up in.
 * @param {number} frameId - The frame to check (0 = top frame).
 * @param {string} expectedOrigin - The origin the frame must still host.
 * @returns {Promise<boolean>} True only when the frame still hosts expectedOrigin.
 */
const frameHostsOrigin = async (tabID, frameId, expectedOrigin) => {
  try {
    const frame = await browser.webNavigation.getFrame({ tabId: tabID, frameId });
    const currentOrigin = getOrigin(frame?.url);

    if (isUsableOrigin(currentOrigin) && isUsableOrigin(expectedOrigin) && currentOrigin === expectedOrigin) {
      return true;
    }

    await storeLog('warning', 51, new Error('Target frame origin changed since request'), 'resolveTokenTargetFrame');
    return false;
  } catch (err) {
    await storeLog('warning', 51, err, 'resolveTokenTargetFrame - frame lookup failed');
    return false;
  }
};

export default frameHostsOrigin;
