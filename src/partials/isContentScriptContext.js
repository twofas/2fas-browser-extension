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
 * Detects the content-script context: a window whose location is a regular
 * web page rather than an extension page. Content scripts have full
 * browser.storage access (so that is NOT a discriminator), but they run on
 * the PAGE's origin: their fetch is subject to the page's CORS and —
 * critically — their indexedDB is the page's, not the extension's. Nothing
 * key-related may ever touch a content-script context: reading the signing
 * key there would import/promote private key material into a
 * page-readable database.
 *
 * Background (service worker, or a background page at an extension URL) and
 * options/install pages return false.
 *
 * @returns {boolean}
 */
const isContentScriptContext = () => {
  if (typeof window === 'undefined') {
    return false; // service worker or non-window context
  }

  // From here on a window exists — this guard protects key material, so any
  // failure to prove "extension page" must FAIL CLOSED (treat as content
  // script) rather than permit signing in an unidentified page context.
  try {
    if (!window?.location?.href) {
      return true;
    }

    const extensionBaseURL = browser?.runtime?.getURL ? browser.runtime.getURL('') : null;

    if (!extensionBaseURL) {
      return true;
    }

    return !window.location.href.startsWith(extensionBaseURL);
  } catch (e) {
    return true;
  }
};

export default isContentScriptContext;
