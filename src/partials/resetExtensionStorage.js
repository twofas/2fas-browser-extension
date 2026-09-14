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

const RESET_OK = 'ok';
const RESET_PENDING = 'pending';

/**
 * Resets the extension to a fresh identity from an extension page: asks the
 * background to regenerate keys + registration (`storageReset` — it clears
 * storage.local itself and is accepted only from extension pages) and reloads
 * the page once the background confirms. Nothing is wiped on the page side, so
 * a refused or failed reset is non-destructive.
 *
 * @async
 * @returns {Promise<'ok'|'pending'>} 'pending' when the new identity exists but its
 *   registration is still owned by the durable retry — the page must wait, not reload.
 * @throws {Error} When the background refuses or fails the reset.
 */
const resetExtensionStorage = async () => {
  const response = await browser.runtime.sendMessage({ action: 'storageReset' });

  // `pending` is not a failure: either the durable create already owned the keys, or
  // the reset regenerated them and the registration POST has not landed yet. Both are
  // "wait for the retry", so the caller must not surface an error — reloading would
  // only show a page with no extensionID.
  if (response?.status === 'pending' || (response?.status === 'ok' && response?.pending)) {
    return RESET_PENDING;
  }

  if (response?.status !== 'ok') {
    throw new Error(`storageReset failed: ${response?.message || response?.status || 'no response'}`);
  }

  // Reload without the query string. A plain reload would keep `?reason=recovered`
  // on an install page opened by the self-heal, so a deliberate reset would come
  // back announcing "the encryption key was lost". Split on ?/# rather than using
  // URL.origin, which is "null" for extension schemes.
  window.location.replace(window.location.href.split(/[?#]/)[0]);

  return RESET_OK;
};

export default resetExtensionStorage;
export { RESET_OK, RESET_PENDING };
