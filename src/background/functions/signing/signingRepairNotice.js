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
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import TwoFasNotification from '@notification/index.js';
import safeConsole from '@partials/safeConsole.js';

// The extension version the Reset-and-pair-again notice was last delivered
// for — by a one-shot (signingState) or by the reminder (remindSigningRepair).
// An identity field: wiped with the rest of storage.local by the Reset it asks for.
const REMINDED_VERSION_KEY = 'signingRepairRemindedVersion';

/**
 * Delivers a Reset-and-pair-again notice from the background and, once it
 * reached its surface, marks the current extension version as reminded.
 *
 * Native push: handed to the OS. Front-end push (Safari's default): the
 * notice renders inside a page, through the content script of the active tab
 * in the focused window — the service worker has no DOM of its own, so a
 * plain `TwoFasNotification.show(text)` would fail there. No such tab (a
 * browser page, no window) or no content script in it (the message is
 * refused): nothing is shown and nothing is marked, so it is tried again —
 * on the next start, or as soon as a page with the content script loads
 * (`tabId`: the caller already knows the page). Never throws.
 *
 * @async
 * @param {{Title: string, Message: string}} text - The notice (SigningKeyConflict or SigningRequired).
 * @param {?number} [tabId=null] - A tab whose page just loaded the content script, to render in
 *   instead of the active tab (front-end push only).
 * @returns {Promise<boolean>} Whether the notice was shown and the version marked.
 */
const deliverSigningRepairNotice = async (text, tabId = null) => {
  try {
    const { nativePush } = await loadFromLocalStorage(['nativePush']);

    if (nativePush) {
      await TwoFasNotification.show(text);
    } else {
      const [tab] = Number.isInteger(tabId) ? [{ id: tabId }] : await browser.tabs.query({ active: true, lastFocusedWindow: true });

      if (!tab?.id) {
        return false;
      }

      await TwoFasNotification.show(text, tab.id);
    }

    await saveToLocalStorage({ [REMINDED_VERSION_KEY]: config.ExtensionVersion });

    return true;
  } catch (err) {
    safeConsole.error('deliverSigningRepairNotice', err);

    return false;
  }
};

export default deliverSigningRepairNotice;
export { REMINDED_VERSION_KEY };
