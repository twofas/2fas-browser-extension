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

import { loadFromSessionStorage } from '@sessionStorage/index.js';
import storeLog from '@partials/storeLog.js';
import isUsableOrigin from '@background/functions/isUsableOrigin.js';
import frameHostsOrigin from '@background/functions/frameHostsOrigin.js';
import frameHostsUrl from '@background/functions/frameHostsUrl.js';

/**
 * Resolves the frame the decrypted token should be delivered to.
 *
 * frameIds are reused across navigations, so a frame (the top frame included)
 * that navigated to a different origin between the request and the token arriving
 * could otherwise receive the plaintext token. Every candidate frame is therefore
 * verified to STILL host the origin it had at request time before it is honored:
 *   - a frame recorded at request time (handleFrontElement, top or sub) is checked
 *     against its recorded origin;
 *   - with no recorded frame (focus-less request) the top frame is checked against
 *     the request's own origin.
 * When the recorded origin is unknown (legacy session records) we fall back to the
 * top frame unverified, preserving prior behavior. When a frame's origin no longer
 * matches, NO frame is returned (`null`) — the page navigated away, so the token is
 * not delivered anywhere rather than leaking to a different origin.
 *
 * @async
 * @param {number} tabID - The tab the token belongs to.
 * @return {Promise<number|null>} frameId to deliver to (0 = top frame), or null when no frame is safe.
 */
const resolveTokenTargetFrame = async tabID => {
  let storedFrameId;
  let storedOrigin;
  let storedUrl;
  let requestOrigin;

  try {
    const sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
    const tabData = sessionData?.[`tabData-${tabID}`];
    storedFrameId = tabData?.lastFocusedFrameId;
    storedOrigin = tabData?.lastFocusedFrameOrigin;
    storedUrl = tabData?.lastFocusedFrameUrl;
    requestOrigin = tabData?.origin;
  } catch (err) {
    await storeLog('warning', 49, err, 'resolveTokenTargetFrame - session load failed');
    return 0;
  }

  // No specific frame recorded (focus-less request): deliver to the top frame, but
  // only while it still hosts the origin that initiated the request. With no known
  // request origin (legacy record) fall back to the top frame unverified.
  if (typeof storedFrameId !== 'number') {
    if (!isUsableOrigin(requestOrigin)) {
      return 0;
    }

    return (await frameHostsOrigin(tabID, 0, requestOrigin)) ? 0 : null;
  }

  // A frame was recorded (top or sub) but its origin is opaque (about:srcdoc,
  // data:, sandbox without allow-same-origin) — origins are all "null" and not
  // comparable. Re-verify by exact URL instead and deliver to the recorded frame:
  // this restores autofill into opaque sub-frames (3DS / IdP / CMP widgets) that
  // the origin-only check used to misroute to the top frame (Z7). A legacy record
  // with no stored URL keeps the prior behavior (top frame unverified).
  if (!isUsableOrigin(storedOrigin)) {
    if (typeof storedUrl === 'string' && storedUrl.length > 0) {
      return (await frameHostsUrl(tabID, storedFrameId, storedUrl)) ? storedFrameId : null;
    }

    return 0;
  }

  // Confirm the recorded frame still hosts the same origin before sending the
  // plaintext token there; deliver nowhere if it changed.
  return (await frameHostsOrigin(tabID, storedFrameId, storedOrigin)) ? storedFrameId : null;
};

export default resolveTokenTargetFrame;
