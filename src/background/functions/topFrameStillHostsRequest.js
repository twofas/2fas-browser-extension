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
import { loadFromSessionStorage } from '@sessionStorage/index.js';
import isUsableOrigin from '@background/functions/isUsableOrigin.js';
import getOrigin from '@partials/getOrigin.js';

/**
 * Re-validates that the top frame is a safe place to surface the decrypted token
 * before the copy-to-clipboard fallback (Z1). Confirms the request has not been
 * superseded (requestID) and that the top frame STILL hosts the origin that
 * initiated the request (frameIds/tabs are reused across navigations, so a page
 * that navigated to a different site must not receive the token). A legacy record
 * with no comparable origin is allowed, preserving prior behavior.
 *
 * @async
 * @param {number} tabID - The tab to check.
 * @param {string} tokenRequestId - The request id this token belongs to.
 * @returns {Promise<boolean>} True only when the top frame is safe for the token.
 */
const topFrameStillHostsRequest = async (tabID, tokenRequestId) => {
  try {
    const sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
    const tabData = sessionData?.[`tabData-${tabID}`];

    // A newer request took over this tab → this token is stale; withhold it.
    if (tabData?.requestID && tabData.requestID !== tokenRequestId) {
      return false;
    }

    const requestOrigin = tabData?.origin;

    if (!isUsableOrigin(requestOrigin)) {
      return true;
    }

    const frame = await browser.webNavigation.getFrame({ tabId: tabID, frameId: 0 });
    const currentOrigin = getOrigin(frame?.url);

    return isUsableOrigin(currentOrigin) && currentOrigin === requestOrigin;
  } catch {
    return false;
  }
};

export default topFrameStillHostsRequest;
