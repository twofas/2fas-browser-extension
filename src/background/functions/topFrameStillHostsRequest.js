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
 * that navigated to a different site must not receive the token). A record with
 * no comparable request origin is NOT trusted: every request stores its origin
 * before the push, so a missing origin means the record was wiped mid-flight
 * (onTabUpdated's cross-origin invalidation racing an in-flight 2fa_response) —
 * the old allowance for any http(s) page here could surface the token on the
 * origin the user navigated TO.
 *
 * Returns a verdict rather than a bare boolean so the caller can tell the benign
 * causes apart (a post-login redirect vs. an approved-but-outdated request vs. a
 * genuine lookup failure) instead of logging them all as one event.
 *
 * @async
 * @param {number} tabID - The tab to check.
 * @param {string} tokenRequestId - The request id this token belongs to.
 * @returns {Promise<{safe: boolean, reason?: ('superseded'|'originChanged'|'lookupFailed'), stage?: ('sessionRead'|'frameLookup'), error?: Error}>}
 *   `{safe: true}` when the top frame may receive the token; otherwise `safe: false` with
 *   `reason` — 'superseded' (a newer request took over the tab), 'originChanged' (the top
 *   frame no longer hosts the request origin) or 'lookupFailed' (with the real `error`
 *   and the `stage` that failed: the session-storage read or the webNavigation lookup).
 */
const topFrameStillHostsRequest = async (tabID, tokenRequestId) => {
  let stage = 'sessionRead';

  try {
    const sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
    const tabData = sessionData?.[`tabData-${tabID}`];

    // A newer request took over this tab → this token is stale; withhold it.
    if (tabData?.requestID && tabData.requestID !== tokenRequestId) {
      return { safe: false, reason: 'superseded' };
    }

    const requestOrigin = tabData?.origin;

    // No comparable request origin = record wiped mid-flight (see the function
    // doc) — the page moved on; withhold without even looking the frame up.
    if (!isUsableOrigin(requestOrigin)) {
      return { safe: false, reason: 'originChanged' };
    }

    stage = 'frameLookup';
    const frame = await browser.webNavigation.getFrame({ tabId: tabID, frameId: 0 });
    const currentOrigin = getOrigin(frame?.url);

    if (isUsableOrigin(currentOrigin) && currentOrigin === requestOrigin) {
      return { safe: true };
    }

    // Also covers an opaque/undeterminable current origin (mid-navigation,
    // about:blank): the top frame is in transit, which is the same "page moved
    // on" situation as a committed cross-origin navigation.
    return { safe: false, reason: 'originChanged' };
  } catch (err) {
    return { safe: false, reason: 'lookupFailed', stage, error: err };
  }
};

export default topFrameStillHostsRequest;
