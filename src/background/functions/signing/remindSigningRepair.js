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
import { loadFromLocalStorage } from '@localStorage/index.js';
import safeConsole from '@partials/safeConsole.js';
import deliverSigningRepairNotice, { REMINDED_VERSION_KEY } from './signingRepairNotice.js';

// Single flight: a browser start that applies an update fires onStartup and
// onInstalled together, and several pages can load at once.
let inFlight = null;

/**
 * The notice a signing state calls for, or null. Conflict first: it names the
 * cause (the key could not be registered), of which a later rejection is only
 * the consequence — the same precedence as the options/install page overlay.
 *
 * @param {Object|undefined} signing - The stored signing state.
 * @returns {{Title: string, Message: string}|null}
 */
const pendingText = signing => {
  if (signing?.conflict) {
    return config.Texts.Error.SigningKeyConflict;
  }

  return signing?.registrationRequired ? config.Texts.Error.SigningRequired : null;
};

/**
 * One reminder pass (see remindSigningRepair).
 *
 * @async
 * @param {?number} tabId - A page that just loaded the content script, or null (the active tab).
 * @returns {Promise<void>}
 */
const remind = async tabId => {
  try {
    const storage = await loadFromLocalStorage(['signing', REMINDED_VERSION_KEY]);
    const text = pendingText(storage?.signing);

    if (!text || storage?.[REMINDED_VERSION_KEY] === config.ExtensionVersion) {
      return;
    }

    await deliverSigningRepairNotice(text, tabId);
  } catch (err) {
    safeConsole.error('remindSigningRepair', err);
  }
};

const runOnce = tabId => {
  if (!inFlight) {
    inFlight = remind(tabId).finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
};

/**
 * Reminds an install whose signing identity cannot be repaired in place —
 * the backend holds a signing key it does not have (conflict), or rejects it
 * for good (registrationRequired) — to use Reset Browser Extension on the
 * options page and pair again. The backend never replaces a registered key,
 * so a Reset (new identity) is the only way such an install signs again; done
 * before the backend starts rejecting unsigned requests, the user never sees
 * the extension stop working. Once per extension version, on every browser
 * start and update; a one-shot notice delivered at the moment the state was
 * entered (signingState) already counts for that version. The options and
 * install pages show the same advice as a persistent overlay. Never throws.
 *
 * @returns {Promise<void>}
 */
const remindSigningRepair = () => runOnce(null);

/**
 * The same reminder for a page that just loaded the content script (the
 * background's getTabData handler): where front-end push is the notification
 * surface (Safari's default), a browser start finds only a loading tab or a
 * Start Page, so the first http(s) page is the first chance to render. A
 * no-op without a usable tab id, once this version was reminded, and for a
 * healthy install. Never throws.
 *
 * @param {*} tabId - `sender.tab.id` of the page.
 * @returns {Promise<void>}
 */
const remindSigningRepairInTab = tabId => (Number.isInteger(tabId) ? runOnce(tabId) : Promise.resolve());

export default remindSigningRepair;
export { remindSigningRepairInTab, REMINDED_VERSION_KEY };
