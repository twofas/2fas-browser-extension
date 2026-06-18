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

import config from '@/config.js';
import getOrigin from '@partials/getOrigin.js';

/**
 * Decides whether a tab's "complete" load event should invalidate an in-flight
 * 2FA request. A request is only invalidated by a genuine navigation to a
 * different origin; same-origin "complete" events (the login page finishing
 * load, in-page redirects, reloads, subframe completions, …) keep it alive.
 *
 * When the origin can't be determined (e.g. data stored before this field
 * existed, or an opaque current URL), it falls back to a time window relative
 * to `tabData.lastAction`: a load that completes within `ResendPushTimeout` of
 * the request almost always means the originating page is still settling.
 *
 * @param {Object} tabData - The stored tab data (`url`, `lastAction`, …).
 * @param {string|null} currentURL - The URL of the just-completed load.
 * @param {number} now - Current timestamp in milliseconds.
 * @return {boolean} True when the in-flight request should be invalidated.
 */
const shouldInvalidateTabRequest = (tabData, currentURL, now) => {
  const requestOrigin = getOrigin(tabData?.url);
  const currentOrigin = getOrigin(currentURL);

  // Both origins known: invalidate only on a real cross-origin navigation.
  if (requestOrigin && currentOrigin) {
    return requestOrigin !== currentOrigin;
  }

  // Origin undeterminable: keep the request while it is still fresh.
  if (tabData?.lastAction) {
    return ((now - tabData.lastAction) / 1000) >= config.ResendPushTimeout;
  }

  // No origin and no timing info: keep the safe default of cleaning up.
  return true;
};

export default shouldInvalidateTabRequest;
