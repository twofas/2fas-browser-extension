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
import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import TwoFasNotification from '@notification/index.js';
import storeLog from '@partials/storeLog.js';

// The missing-private-key state is permanent until the user re-pairs, and the
// integrity check re-runs on every extension/browser update. Without this flag
// the same broken install re-emits log 57 and re-shows the notification on each
// of those events, forever.
// One flag per key kind: a logged-only signing-key loss must not silence a
// later RSA-key loss (which needs the user-facing prompt).
const REPORTED_FLAGS = {
  rsa: 'privateKeyMissingReported',
  signing: 'signingKeyMissingReported'
};
const flagFor = key => REPORTED_FLAGS[key] || REPORTED_FLAGS.rsa;

/**
 * Logs the missing-private-key state (error 57) and prompts a re-pair — at most
 * once per incident. The flag lives in storage.local, so it survives restarts
 * and is wiped together with the rest of the state by any reset/regeneration.
 *
 * The diagnostic cause distinguishes the two ways this state arises: an empty
 * IndexedDB with no storage.local key at all, versus a storage.local key that is
 * present but failed to import (a corrupt fallback/legacy leftover).
 *
 * @async
 * @param {Object} storage - Storage object holding keys (used for diagnostics only).
 * @param {string} context - Caller name for the log entry.
 * @param {Object} [options]
 * @param {boolean} [options.notify=true] - Skip the built-in (deduped) notification
 *   when the caller shows its own per-request one instead (token request path).
 * @param {Object} [options.cause] - Extra diagnostic fields merged into the log
 *   entry's cause (e.g. `{ selfHealed: true }` when the caller regenerates storage,
 *   `{ key: 'signing' }` when it is the ECDSA signing key that is gone).
 * @returns {Promise<void>}
 */
const reportMissingPrivateKey = async (storage, context, { notify = true, cause = {} } = {}) => {
  const flag = flagFor(cause.key);
  const flagged = await loadFromLocalStorage(flag);

  if (flagged?.[flag]) {
    return;
  }

  // Read the storage.local copy of the key that is actually missing: a present-but
  // -unimportable copy means a corrupt fallback, and the field differs per key kind.
  // (Reading the RSA field for a signing-key report inverted the diagnostic both ways.)
  const fallbackField = cause.key === 'signing' ? 'signingPrivateKey' : 'privateKey';

  const err = new Error('Private key missing while registration valid; re-pairing required', {
    cause: { key: 'rsa', corruptFallbackKey: Boolean(storage?.keys?.[fallbackField]), ...cause }
  });

  await storeLog('error', 57, err, context);

  if (notify) {
    try {
      await TwoFasNotification.show(config.Texts.Error.StorageIntegrity);
    } catch (notificationErr) {
      // A failed notification must not leave the flag unset — that would re-open
      // the per-update-event flood this reporter exists to prevent.
    }
  }

  await saveToLocalStorage({ [flag]: true });
};

/**
 * Clears the reported flag once the private key is usable again, so a future,
 * separate incident is reported anew.
 *
 * @async
 * @returns {Promise<void>}
 */
const clearMissingPrivateKeyReport = async () => {
  const flags = Object.values(REPORTED_FLAGS);
  const flagged = await loadFromLocalStorage(flags);

  await Promise.all(flags.filter(flag => flagged?.[flag]).map(flag => removeFromLocalStorage(flag)));
};

export default reportMissingPrivateKey;
export { clearMissingPrivateKeyReport };
