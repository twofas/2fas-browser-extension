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
import config from '@/config.js';
import TwoFasNotification from '@notification/index.js';
import { saveToSessionStorage } from '@sessionStorage/index.js';

/**
 * Handles the focused input element and saves it to session storage.
 * @async
 * @param {Array<{frameId: number, url: string, response: *}>} activeElements - Per-frame getActiveElement
 *   results, each carrying the originating `frameId`, frame `url` and the frame's response.
 * @param {number} tabId - The tab ID.
 * @param {Object} sessionData - The session data object containing tabData.
 * @return {Promise<void>}
 */
const handleFrontElement = async (activeElements, tabId, sessionData) => {
  let properElements = [];

  if (activeElements && activeElements.length > 0) {
    // getActiveElement only returns an id for a fillable target (input/textarea,
    // contenteditable, ARIA textbox, or the one-time-code fallback), so the id
    // presence is authoritative — no need to re-gate on nodeName here.
    properElements = activeElements.filter(el =>
      el?.response?.id &&
      (typeof el?.response?.id === 'string' || el?.response?.id instanceof String) &&
      el?.response?.id?.length > 0
    );
  }

  const tabData = sessionData[`tabData-${tabId}`] || {};

  if (properElements.length > 0) {
    // Several frames can report a fillable target at once — the focus-less
    // one-time-code fallback fires independently in every frame. getAllFrames()
    // order does not guarantee the top frame comes first, so prefer it
    // explicitly; otherwise keep the first reported frame (the focused one in
    // the normal single-frame case, including legitimate cross-origin iframes).
    const chosen = properElements.find(el => el.frameId === 0) || properElements[0];

    let frameOrigin = null;

    try {
      frameOrigin = chosen.url ? new URL(chosen.url).origin : null;
    } catch {
      frameOrigin = null;
    }

    // Record the input UUID, the frame it lives in and that frame's origin, so
    // the decrypted token is later delivered only to that frame and only while
    // it still hosts the same origin (frameIds are reused across navigations —
    // see resolveTokenTargetFrame / handleLoginRequest).
    tabData.lastFocusedInput = chosen.response.id;
    tabData.lastFocusedFrameId = chosen.frameId;
    tabData.lastFocusedFrameOrigin = frameOrigin;
    await saveToSessionStorage({ [`tabData-${tabId}`]: tabData });
    return TwoFasNotification.show(config.Texts.Success.PushSent, tabId);
  }

  delete tabData.lastFocusedInput;
  delete tabData.lastFocusedFrameId;
  delete tabData.lastFocusedFrameOrigin;
  await saveToSessionStorage({ [`tabData-${tabId}`]: tabData });

  return TwoFasNotification.show(config.Texts.Success.PushSentClipboard, tabId);
};

export default handleFrontElement;
