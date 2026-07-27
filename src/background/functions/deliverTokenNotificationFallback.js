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
import topFrameStillHostsRequest from '@background/functions/topFrameStillHostsRequest.js';

// NOTE: the decrypted token is NEVER surfaced through a native OS notification.
// OS notifications can persist in the notification center, show on the lock screen
// and mirror to other devices, so a 2FA code must stay inside the page — the only
// fallback for an un-autofilled token is the in-page copy notification below.

/**
 * Last-resort delivery of the decrypted token when it could not be autofilled: show
 * the copy-to-clipboard token notification in the top frame. Gated by
 * topFrameStillHostsRequest so the token is never surfaced on a page that navigated
 * away (Z1) — on mismatch the token is delivered nowhere.
 *
 * If the front-end notification cannot render (no content script — orphaned/blocked
 * page) the token is dropped, NOT pushed to a native OS notification: a 2FA code
 * must never leave the page (see the note at the top of this file). The undeliverable
 * case is logged so it is still observable; the user can re-request the token.
 *
 * @async
 * @param {number} tabID - The tab to notify.
 * @param {string} token - The decrypted token.
 * @param {string} tokenRequestId - The request id.
 * @returns {Promise<void>}
 */
const deliverTokenNotificationFallback = async (tabID, token, tokenRequestId) => {
  const safe = await topFrameStillHostsRequest(tabID, tokenRequestId);

  if (!safe) {
    await storeLog('warning', 56, new Error('Top-frame token fallback blocked (requestID/origin mismatch)'), 'handleLoginRequest');
    return;
  }

  const shown = await browser.tabs
    .sendMessage(tabID, { action: 'showTokenNotification', token, token_request_id: tokenRequestId }, { frameId: 0 })
    .then(res => res?.status === 'ok')
    .catch(() => false);

  if (!shown) {
    // The front-end notification could not render (no content script). Do NOT fall
    // back to a native OS notification carrying the token — the code stays in the
    // page. Log and drop so the failure is observable without leaking the token.
    await storeLog('warning', 58, new Error('Front-end token notification undeliverable; token withheld'), 'handleLoginRequest');
  }
};

export default deliverTokenNotificationFallback;
