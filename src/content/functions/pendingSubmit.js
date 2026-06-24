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

import clickSubmit from '@content/functions/clickSubmit.js';

// When the token is filled while the page is still loading (tab.status !==
// 'complete'), auto-submit cannot run yet — the form/submit may not exist. The
// fill queues itself here and the content script replays it once the background
// signals 'pageLoadComplete' (U5 deferred auto-submit).

// Upper bound on how long a queued submit may wait before it is replayed. A TOTP
// code is only valid for ~30 s, so a fill that has been pending longer than this
// is treated as stale and dropped rather than risk submitting an expired code.
export const MAX_PENDING_SUBMIT_AGE_MS = 15000;

let pendingSubmit = null;

/**
 * Queues an auto-submit to be replayed when the page finishes loading.
 * Only the most recent fill is kept.
 * @param {HTMLElement} inputElement - The input the token was filled into.
 * @param {string} siteURL - The current site URL (for exclusion checking).
 * @returns {void}
 */
export const setPendingSubmit = (inputElement, siteURL) => {
  pendingSubmit = { inputElement, siteURL, queuedAt: Date.now() };
};

/**
 * Discards any queued auto-submit.
 * @returns {void}
 */
export const clearPendingSubmit = () => {
  pendingSubmit = null;
};

/**
 * Replays a queued auto-submit, if one is still fresh. Resumes at most once per
 * queued fill (the queue is cleared up front, so a later 'pageLoadComplete' will
 * not re-fire it), drops fills older than MAX_PENDING_SUBMIT_AGE_MS, and drops
 * fills whose input is no longer connected to the document.
 * @returns {boolean} True if a queued submit was replayed.
 */
export const resumePendingSubmit = () => {
  if (!pendingSubmit) {
    return false;
  }

  const { inputElement, siteURL, queuedAt } = pendingSubmit;
  pendingSubmit = null;

  if (Date.now() - queuedAt > MAX_PENDING_SUBMIT_AGE_MS) {
    return false;
  }

  // The page may have re-rendered while it finished loading. If the filled input
  // is no longer in the document the proximity anchor for picking the right
  // submit is gone, so drop the replay rather than risk clicking a stray button.
  if (!inputElement?.isConnected) {
    return false;
  }

  clickSubmit(inputElement, siteURL);

  return true;
};
