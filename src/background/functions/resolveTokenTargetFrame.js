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
 * Resolves the frame the decrypted token should be delivered to, defaulting to
 * the top frame (frameId 0).
 *
 * A non-top frame recorded at request time (handleFrontElement) is only honored
 * when it still hosts the same, non-opaque origin. frameIds are reused across
 * navigations, so without this check a frame that navigated to a different
 * origin between the request and the token arriving could receive the plaintext
 * token. On any doubt (missing/throwing session data, removed frame, changed or
 * opaque origin) we fall back to the top frame, which is always same-origin with
 * the page the user navigated to.
 *
 * @async
 * @param {number} tabID - The tab the token belongs to.
 * @return {Promise<number>} The frameId to deliver the token to (0 = top frame).
 */
const resolveTokenTargetFrame = async tabID => {
  let storedFrameId;
  let storedOrigin;

  try {
    const sessionData = await loadFromSessionStorage([`tabData-${tabID}`]);
    const tabData = sessionData?.[`tabData-${tabID}`];
    storedFrameId = tabData?.lastFocusedFrameId;
    storedOrigin = tabData?.lastFocusedFrameOrigin;
  } catch (err) {
    await storeLog('warning', 49, err, 'resolveTokenTargetFrame - session load failed');
    return 0;
  }

  // No recorded frame, or the top frame itself — no origin check needed: frameId
  // 0 is always the same-origin main document of the tab.
  if (typeof storedFrameId !== 'number' || storedFrameId === 0) {
    return 0;
  }

  // A subframe was recorded — confirm it still hosts the same origin before
  // sending the plaintext token there.
  try {
    const frame = await browser.webNavigation.getFrame({ tabId: tabID, frameId: storedFrameId });
    let currentOrigin = null;

    try {
      currentOrigin = frame?.url ? new URL(frame.url).origin : null;
    } catch {
      currentOrigin = null;
    }

    if (isUsableOrigin(currentOrigin) && isUsableOrigin(storedOrigin) && currentOrigin === storedOrigin) {
      return storedFrameId;
    }

    await storeLog('warning', 51, new Error('Target frame origin changed since request'), 'resolveTokenTargetFrame');
    return 0;
  } catch (err) {
    await storeLog('warning', 51, err, 'resolveTokenTargetFrame - frame lookup failed');
    return 0;
  }
};

export default resolveTokenTargetFrame;
