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

import S from '@/selectors.js';
import { INSTALL_PAGE_REASON_RECOVERED } from '@partials/installPageReasons.js';

/**
 * Reveals the "extension data was lost, pair again" banner when the install page
 * was opened by the background after an automatic storage regeneration
 * (`installPage.html?reason=recovered`, see selfHealMissingPrivateKey). No-op for
 * a regular first-run open.
 *
 * @returns {void}
 */
const showRecoveredInfo = () => {
  let reason = null;

  try {
    reason = new URLSearchParams(window.location.search).get('reason');
  } catch (err) {
    return;
  }

  if (reason !== INSTALL_PAGE_REASON_RECOVERED) {
    return;
  }

  // One-shot: strip the parameter so a reload — the user's own, or the one
  // resetExtensionStorage performs — does not re-announce a data loss that has
  // already been explained (this page is also the "add another device" page).
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch (err) {
    // History API unavailable (about:blank-ish contexts): the banner still shows.
  }

  const el = document.querySelector(S.installPage.recoveredInfo);

  if (el) {
    el.classList.remove('hidden');
  }
};

export default showRecoveredInfo;
