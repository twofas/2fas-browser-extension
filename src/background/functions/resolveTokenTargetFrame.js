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

/* global URL */
import browser from 'webextension-polyfill';
import { loadFromSessionStorage } from '@sessionStorage/index.js';
import storeLog from '@partials/storeLog.js';

/**
 * Whether an origin is a usable, comparable identity. Opaque origins
 * (`data:`, `about:srcdoc`, sandboxed frames) all stringify to the literal
 * "null", so two *different* opaque documents would compare equal — they must
 * never be treated as a match for token delivery.
 *
 * @param {*} origin - The origin string from `new URL(url).origin`.
 * @return {boolean} True when the origin uniquely identifies a real origin.
 */
const isUsableOrigin = origin => typeof origin === 'string' && origin.length > 0 && origin !== 'null';

/**
 * Whether a frame currently hosts `expectedOrigin`. Looks up the frame's live URL
 * via webNavigation and compares origins; any doubt (removed frame, opaque/changed
 * origin, lookup error) resolves to false so the caller does not deliver there.
 *
 * @async
 * @param {number} tabID - The tab to look the frame up in.
 * @param {number} frameId - The frame to check (0 = top frame).
 * @param {string} expectedOrigin - The origin the frame must still host.
 * @return {Promise<boolean>} True only when the frame still hosts expectedOrigin.
 */
const frameHostsOrigin = async (tabID, frameId, expectedOrigin) => {
  try {
    const frame = await browser.webNavigation.getFrame({ tabId: tabID, frameId });
    let currentOrigin = null;

    try {
      currentOrigin = frame?.url ? new URL(frame.url).origin : null;
    } catch {
      currentOrigin = null;
    }

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
  let requestOrigin;

  try {
    const sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
    const tabData = sessionData?.[`tabData-${tabID}`];
    storedFrameId = tabData?.lastFocusedFrameId;
    storedOrigin = tabData?.lastFocusedFrameOrigin;
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

  // A frame was recorded (top or sub). With no recorded origin to compare against
  // (legacy record) fall back to the top frame unverified.
  if (!isUsableOrigin(storedOrigin)) {
    return 0;
  }

  // Confirm the recorded frame still hosts the same origin before sending the
  // plaintext token there; deliver nowhere if it changed.
  return (await frameHostsOrigin(tabID, storedFrameId, storedOrigin)) ? storedFrameId : null;
};

export default resolveTokenTargetFrame;
