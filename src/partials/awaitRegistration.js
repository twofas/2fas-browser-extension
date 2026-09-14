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

/**
 * Reloads the page once the durable registration finally commits an extensionID.
 *
 * A page that opens while `create` is still pending (offline install, or a reset
 * that could not reach the API) cannot do anything useful: there is no extensionID
 * to build a QR link or fetch devices with. It must not reset either — that would
 * discard the pending record. So it waits here: `flushBrowserRegistration` writes
 * the extensionID from a background retry (alarm / 'online' / next startup), and
 * storage.onChanged is the only signal the page gets — nothing messages it.
 *
 * Idempotent and self-removing, so repeated calls cannot stack listeners.
 *
 * @returns {void}
 */
const awaitRegistration = () => {
  const onChanged = (changes, areaName) => {
    if (areaName !== 'local' || !changes?.extensionID?.newValue) {
      return;
    }

    try {
      browser.storage.onChanged.removeListener(onChanged);
    } catch (err) {
      // Listener already gone — the reload below is what matters.
    }

    window.location.reload();
  };

  try {
    browser.storage.onChanged.addListener(onChanged);
  } catch (err) {
    // No storage.onChanged in this context: the page simply stays as it is until
    // the user reloads it themselves.
  }
};

export default awaitRegistration;
