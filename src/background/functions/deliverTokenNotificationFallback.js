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
import config from '@/config.js';
import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';
import showNativePush from '@notification/functions/showNativePush.js';
import topFrameStillHostsRequest from '@background/functions/topFrameStillHostsRequest.js';

// NOTE: the decrypted token is NEVER surfaced through a native OS notification.
// OS notifications can persist in the notification center, show on the lock screen
// and mirror to other devices, so a 2FA code must stay inside the page — the only
// fallback for an un-autofilled token is the in-page copy notification below.

/**
 * Last-resort delivery of the decrypted token when it could not be autofilled: show
 * the copy-to-clipboard token notification in the top frame. Gated by
 * topFrameStillHostsRequest so the token is never surfaced on a page that navigated
 * away (Z1) — when the top frame is not safe the token is delivered nowhere, and the
 * blocked causes are handled separately:
 *   - originChanged: the top frame navigated since the request — almost always the
 *     post-login redirect after a successful fill, so it is not logged at all;
 *   - superseded: the user approved an outdated push (a newer request took over the
 *     tab) — logged as info (61) and the user is told via TwoFasNotification, which
 *     honors the native/front-end notification setting; the token itself is dropped;
 *   - lookupFailed: the safety check itself failed — logged as warning (62), constant
 *     message carrying the failed stage, real underlying error in the `cause`.
 *
 * If the front-end notification cannot render (no content script — bfcache-restored,
 * orphaned or blocked page) the token is dropped, NOT pushed to a native OS
 * notification: a 2FA code must never leave the page (see the note at the top of
 * this file). The undeliverable case is logged with the underlying failure as the
 * error `cause` (kept out of the message so storeLog's global message filters don't
 * swallow it) and the user gets a token-FREE native notification telling them to
 * reload the page — the front-end channel is by definition dead here, so
 * TwoFasNotification.show (which honors the nativePush setting) would be a no-op
 * for front-end users.
 *
 * @async
 * @param {number} tabID - The tab to notify.
 * @param {string} token - The decrypted token.
 * @param {string} tokenRequestId - The request id.
 * @returns {Promise<void>}
 */
const deliverTokenNotificationFallback = async (tabID, token, tokenRequestId) => {
  const verdict = await topFrameStillHostsRequest(tabID, tokenRequestId);

  if (!verdict.safe) {
    if (verdict.reason === 'superseded') {
      await storeLog('info', 61, new Error('Token withheld: request superseded by a newer one (outdated push approved)'), 'handleLoginRequest');
      // Best-effort feedback (no token attached) — a page without the content
      // script must not escalate this benign case into an error.
      await TwoFasNotification.show(config.Texts.Error.OldRequest, tabID).catch(() => {});
    } else if (verdict.reason === 'lookupFailed') {
      // Constant message with the raw error in `cause` — the raw text must stay
      // out of the message so storeLog's global filters (e.g. Safari's dead-tab
      // "… Tab not found.") can't swallow the entry; the stage separates
      // session-storage failures from webNavigation.getFrame rejections.
      await storeLog('warning', 62, new Error(`Top-frame safety lookup failed (${verdict.stage || 'frameLookup'}); token withheld`, { cause: verdict.error }), 'handleLoginRequest');
    }

    // originChanged: the page navigated after a (nearly always successful) login —
    // withhold the token silently, this is the fallback working as designed.
    return;
  }

  let failure = null;

  const shown = await browser.tabs
    .sendMessage(tabID, { action: 'showTokenNotification', token, token_request_id: tokenRequestId }, { frameId: 0 })
    .then(res => {
      if (res?.status === 'ok') {
        return true;
      }

      failure = `content script responded with status: ${res?.status || 'none'}${res?.message ? ` (${res.message})` : ''}`;
      return false;
    })
    .catch(err => {
      failure = err?.message || String(err);
      return false;
    });

  if (!shown) {
    // The front-end notification could not render (no content script). Do NOT fall
    // back to a native OS notification carrying the token — the code stays in the
    // page. Log (real failure in `cause`) and drop, then tell the user how to
    // recover via a token-free native notification; without it every retry hits
    // the same dead channel invisibly.
    await storeLog('warning', 58, new Error('Front-end token notification undeliverable; token withheld', { cause: failure }), 'handleLoginRequest');

    try {
      await showNativePush(config.Texts.Error.TokenNotDelivered, false);
    } catch {}
  }
};

export default deliverTokenNotificationFallback;
