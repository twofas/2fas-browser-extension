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

import { initContextMenu } from '@background/contextMenu/index.js';
import flushBrowserRegistration from '@background/functions/update/flushBrowserRegistration.js';
import ensureSigningKeyRegistration from '@background/functions/update/ensureSigningKeyRegistration.js';
import checkSafariStorage from '@background/functions/checkSafariStorage.js';
import getBrowserInfo from '@background/functions/getBrowserInfo.js';
import storeLog from '@partials/storeLog.js';

/**
 * Handles browser startup event.
 * Recreates context menus which don't persist between sessions in Firefox.
 * Also retries any pending browser-extension registration that didn't get delivered
 * (e.g. an update that happened while offline) — the portable recovery path on
 * platforms without service-worker-waking alarms.
 * Note: tabData cleanup is no longer needed since we use session storage.
 * @async
 * @return {Promise<void>}
 */
const onStartup = async () => {
  try {
    await initContextMenu();
  } catch (err) {
    await storeLog('error', 1, err, 'onStartup');
  }

  // Safari: the extension-origin IndexedDB is re-homed on every launch and can be
  // lost on the way (issue #142), and a same-build reinstall fires no onInstalled
  // there — so the key material is checked (and self-healed) on every start,
  // before the user runs into it at token time. checkSafariStorage logs its own
  // failures (35).
  //
  // No pre-check delay: WebKit cannot run extension JS while the origin rename is
  // in flight. `WebExtensionContext::load()` calls `loadBackgroundWebViewDuringLoad()`
  // only from the completion handler of `moveLocalStorageIfNeeded`, and
  // `m_safeToLoadBackgroundContent` stays false until the `_renameOrigin` IPC reply
  // lands, so onStartup/onInstalled/alarms all fire post-rename (verified against
  // WebKit trunk and safari-7618…7624, 2026-08-31). A wait here only delayed the
  // signing-key registration and the durable flush below — on a platform WebKit
  // already reports as slow to load extensions (bug 320812) — while protecting a
  // window that does not exist. It runs before them on purpose: a heal replaces the
  // identity, so registering a signing key for the old one first would be wasted.
  if (process.env.EXT_PLATFORM === 'Safari') {
    try {
      await checkSafariStorage(await getBrowserInfo());
    } catch (err) {
      console.error('onStartup - checkSafariStorage', err);
    }
  }

  // v1.9.0: re-attempt a not-yet-registered signing key on every browser
  // start (it enqueues + flushes the durable PUT itself); no-op once active.
  try {
    await ensureSigningKeyRegistration();
  } catch (err) {
    console.error('onStartup - ensureSigningKeyRegistration', err);
  }

  flushBrowserRegistration();
};

export default onStartup;
