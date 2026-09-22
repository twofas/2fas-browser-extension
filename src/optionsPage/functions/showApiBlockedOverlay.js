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
import S from '@/selectors.js';
import { createTextElement } from '@partials/DOMElements';

// Where the user changes the extension's access to the API host. Safari may list
// the grant under the bare domain (2fas.com) rather than api2.2fas.com, so the
// steps name both. There is no button to grant it from here: in Safari
// permissions.request cannot help (a site on "Ask" gets Safari's own prompt
// before this overlay ever shows, and for a site on "Deny" WebKit answers
// without prompting or granting).
const SAFARI_STEPS = [
  ['apiBlockedSafariStep1', 'Open Safari → Settings → Extensions.'],
  ['apiBlockedSafariStep2', 'Select 2FAS and click Edit Websites.'],
  ['apiBlockedSafariStep3', 'Set 2fas.com (or api2.2fas.com) to Allow, then click Refresh below. If neither is listed, set “When visiting other websites” to Allow.']
];

const BROWSER_STEPS = [
  ['apiBlockedStep1', 'Open your browser\'s extensions page and the details of 2FAS.'],
  ['apiBlockedStep2', 'Under Site access (Permissions in Firefox), allow access to 2fas.com, then click Refresh below.']
];

/**
 * Shows the overlay for an API the browser blocks (no host access to it, so every
 * request with our headers fails CORS): nothing on this page works, and a Reset
 * would not help, so the overlay only explains where to allow the access.
 *
 * @param {Object} [options]
 * @param {Function} [options.reload] - Called by Refresh; reloads the page by default.
 * @returns {void}
 */
const showApiBlockedOverlay = ({ reload = () => window.location.reload() } = {}) => {
  const el = document.querySelector(S.optionsPage.apiBlocked);

  if (!el) {
    return;
  }

  const list = el.querySelector(S.optionsPage.apiBlockedSteps);

  if (list) {
    const steps = process.env.EXT_PLATFORM === 'Safari' ? SAFARI_STEPS : BROWSER_STEPS;

    list.replaceChildren(...steps.map(([key, fallback]) => createTextElement('li', browser.i18n.getMessage(key) || fallback)));
  }

  const refresh = el.querySelector(S.optionsPage.apiBlockedRefresh);

  if (refresh && !refresh.dataset.bound) {
    refresh.dataset.bound = 'true';
    refresh.addEventListener('click', () => reload());
  }

  el.classList.add('show-integrity-error');
};

export default showApiBlockedOverlay;
