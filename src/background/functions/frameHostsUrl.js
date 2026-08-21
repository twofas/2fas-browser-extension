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

/**
 * Whether a frame still hosts `expectedUrl` exactly. Used for opaque-origin frames
 * (`about:srcdoc`, `data:`) whose origin stringifies to the non-comparable "null":
 * the frameId pins the specific frame and the exact-URL match confirms it has not
 * navigated to a different document since the request. Any doubt resolves to false.
 *
 * ACCEPTED LIMITATION (F3, reviewed 2026-07-13): for `data:` frames the URL encodes
 * the full document, so an exact-URL match is a true content identity. For
 * `about:srcdoc` the URL is always the literal "about:srcdoc" regardless of content,
 * so a parent that rewrites its iframe's `srcdoc` in place could pass this check with
 * different content. This residual is accepted rather than fixed with
 * `webNavigation` `documentId` because (a) `documentId` is not available across all
 * supported engines (Chromium 106+, inconsistent on Firefox/Safari), and (b) srcdoc
 * content is authored by the SAME parent document the user is already on, within a
 * seconds-long request→delivery window — not a cross-origin exposure. If a stable
 * cross-browser document identity becomes available, capture it at request time
 * (handleFrontElement) and prefer it here; until then, exact-URL is the guard.
 *
 * @async
 * @param {number} tabID - The tab to look the frame up in.
 * @param {number} frameId - The frame to check.
 * @param {string} expectedUrl - The exact URL the frame must still host.
 * @returns {Promise<boolean>} True only when the frame still hosts expectedUrl.
 */
const frameHostsUrl = async (tabID, frameId, expectedUrl) => {
  try {
    const frame = await browser.webNavigation.getFrame({ tabId: tabID, frameId });

    if (frame?.url && frame.url === expectedUrl) {
      return true;
    }

    // Info, not warning — see frameHostsOrigin: guard working as designed, benign
    // causes dominate. currentUrlEmpty=true marks frame-gone / Safari-withheld-URL
    // rather than an actual document change.
    await storeLog('info', 51, new Error('Target opaque frame URL changed since request', {
      cause: { wasTopFrame: frameId === 0, currentUrlEmpty: !frame?.url }
    }), 'resolveTokenTargetFrame');
    return false;
  } catch (err) {
    // Real API failure (Firefox/Safari reject for a missing frame/tab) — own
    // warning ID, apart from the benign changed-traffic in 51.
    await storeLog('warning', 68, err, 'resolveTokenTargetFrame - opaque frame lookup failed');
    return false;
  }
};

export default frameHostsUrl;
