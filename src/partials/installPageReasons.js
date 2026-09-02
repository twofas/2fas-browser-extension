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

// `installPage.html?reason=<value>` — the background opens the install page with
// a reason, the install page reacts to it. Shared here because the two bundles
// must not import each other (the page would pull in the whole background chain).

/**
 * Opened by selfHealMissingPrivateKey after an automatic storage regeneration:
 * the page explains that the extension was reset and the device must be paired
 * again.
 * @type {string}
 */
const INSTALL_PAGE_REASON_RECOVERED = 'recovered';

/**
 * storage.local marker left by an OFFLINE self-heal: the identity was regenerated
 * but the create POST could not land, so the pairing page was not opened (it needs
 * the new extensionID). flushBrowserRegistration opens `?reason=recovered` the moment
 * the durable retry commits the registration, then clears this. Lives here rather
 * than in selfHealMissingPrivateKey because flushBrowserRegistration is imported BY
 * the heal — importing back would be a cycle.
 * @type {string}
 */
const RECOVERED_PAGE_PENDING_KEY = 'recoveredInstallPagePending';

export { INSTALL_PAGE_REASON_RECOVERED, RECOVERED_PAGE_PENDING_KEY };
