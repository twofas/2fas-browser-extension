//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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

const INSTALL_PAGE_PATH = 'installPage/installPage.html';

/**
 * Finds an already-open install page, if any.
 *
 * Compared by path with the query string stripped: `URL.origin` is "null" for
 * non-special schemes (safari-web-extension://, moz-extension:// in some engines),
 * so the extension URL cannot be rebuilt portably from its parts.
 *
 * @async
 * @returns {Promise<Object|null>} The tab, or null when none is open / the lookup failed.
 */
const findInstallPageTab = async () => {
  try {
    const base = browser.runtime.getURL(`/${INSTALL_PAGE_PATH}`);
    const tabs = await browser.tabs.query({});

    return tabs.find(tab => typeof tab?.url === 'string' && tab.url.split(/[?#]/)[0] === base) || null;
  } catch (err) {
    // No tabs permission in this context, or the query failed: fall back to
    // creating a tab, which is the pre-1.9.0 behaviour.
    return null;
  }
};

/**
 * Opens the install (pairing) page, reusing an already-open one.
 *
 * Reuse matters because several paths can ask for it at once — the Safari self-heal
 * opens `?reason=recovered` while the startup check or a toolbar click opens the
 * plain page — and a second tab would hide the "data was lost, pair again" banner
 * behind an identical-looking one. When a reason is given the existing tab is
 * navigated to it so the explanation is never lost.
 *
 * @async
 * @param {?string} [reason=null] - Optional `?reason=` value the page reacts to
 *   (e.g. 'recovered' after an automatic storage regeneration).
 * @param {Object} [options]
 * @param {boolean} [options.focusWindow=true] - Raise the reused tab's window. Pass
 *   false when no user gesture is behind the call (a background self-heal).
 * @returns {Promise<Object>} The created or focused tab.
 */
const openInstallPage = async (reason = null, { focusWindow = true } = {}) => {
  const url = reason
    ? `${INSTALL_PAGE_PATH}?reason=${encodeURIComponent(reason)}`
    : INSTALL_PAGE_PATH;

  const existing = await findInstallPageTab();

  if (existing?.id !== undefined && existing?.id !== null) {
    try {
      // Always navigate, never just select: the open tab is very likely stale — it
      // may still show the "successfully paired" view of an identity that has since
      // been reset, or a pairing screen whose QR was never generated because the
      // registration had not landed. Re-navigating re-runs the page bootstrap.
      const tab = await browser.tabs.update(existing.id, { active: true, url });

      // Selecting a tab does not raise its window, so a toolbar click from another
      // window would otherwise look like it did nothing at all. A background heal is
      // the opposite case: it fires during a silent browser update with no user
      // gesture behind it, and yanking the window forward mid-typing is hostile.
      if (focusWindow && typeof existing.windowId === 'number') {
        await browser.windows.update(existing.windowId, { focused: true }).catch(() => {});
      }

      return tab;
    } catch (err) {
      // The tab went away between query and update — create a fresh one.
    }
  }

  return browser.tabs.create({ url });
};

export default openInstallPage;
export { INSTALL_PAGE_PATH };
