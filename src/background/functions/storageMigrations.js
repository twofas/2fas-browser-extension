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

import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';
import { defaultSigningState, SIGNING_STORAGE_KEY } from '@background/functions/signing/signingState.js';

/**
 * Current storage schema version. Bump this and append a migration whenever the
 * shape of stored data changes in a way existing installs must be upgraded to.
 * @type {number}
 */
const CURRENT_SCHEMA_VERSION = 3;

/**
 * Ordered list of schema migrations. Each entry's `version` is the schema version
 * it upgrades storage TO; `migrate` performs the (offline-only, idempotent) change.
 * Installs older than `version` run it, in ascending order.
 * @type {Array<{version: number, migrate: () => Promise<void>}>}
 */
const migrations = [
  {
    version: 1,
    migrate: async () => {
      // Guarantee the excluded-domains list is an array — older/corrupt installs
      // could leave it missing or non-array, and every consumer spreads/filters it.
      const data = await loadFromLocalStorage(['autoSubmitExcludedDomains']);

      if (!Array.isArray(data.autoSubmitExcludedDomains)) {
        await saveToLocalStorage({ autoSubmitExcludedDomains: [] });
      }
    }
  },
  {
    version: 2,
    migrate: async () => {
      // v1.9.0 request signing: seed the signing lifecycle state for existing
      // installs. Offline-only — the ECDSA keypair generation and its backend
      // registration are network/crypto work owned by
      // ensureSigningKeyRegistration + the durable registration queue.
      const data = await loadFromLocalStorage([SIGNING_STORAGE_KEY]);

      if (!data?.[SIGNING_STORAGE_KEY] || typeof data[SIGNING_STORAGE_KEY] !== 'object') {
        await saveToLocalStorage({ [SIGNING_STORAGE_KEY]: defaultSigningState() });
      }
    }
  },
  {
    // v3: the storage.local → IndexedDB key-promotion bookkeeping is gone
    // (keys in storage.local are now used in place, never promoted or stripped);
    // drop its stamps. A leftover plaintext key next to an IndexedDB copy is
    // harmless — storage.local always wins.
    version: 3,
    migrate: async () => {
      const data = await loadFromLocalStorage(['privateKeyIdbStamp', 'signingKeyIdbStamp']);

      await Promise.all(
        ['privateKeyIdbStamp', 'signingKeyIdbStamp']
          .filter(key => data?.[key] !== undefined)
          .map(key => removeFromLocalStorage(key))
      );
    }
  }
];

/**
 * Runs any pending storage-schema migrations and records the new version. Safe to
 * call on every update: it is a no-op once storage is at (or beyond) the current
 * version, never downgrades, and is offline-only so it never blocks on the network.
 *
 * @async
 * @returns {Promise<number|false>} The schema version after running (≥ current), or
 *   `false` if a migration threw.
 */
const runStorageMigrations = async () => {
  try {
    const data = await loadFromLocalStorage(['storageSchemaVersion']);
    const from = Number.isInteger(data.storageSchemaVersion) ? data.storageSchemaVersion : 0;

    if (from >= CURRENT_SCHEMA_VERSION) {
      return from;
    }

    const pending = migrations
      .filter(m => m.version > from && m.version <= CURRENT_SCHEMA_VERSION)
      .sort((a, b) => a.version - b.version);

    await pending.reduce((chain, m) => chain.then(() => m.migrate()), Promise.resolve());

    await saveToLocalStorage({ storageSchemaVersion: CURRENT_SCHEMA_VERSION });

    return CURRENT_SCHEMA_VERSION;
  } catch (err) {
    await storeLog('error', 54, err, 'runStorageMigrations');
    return false;
  }
};

export default runStorageMigrations;
export { CURRENT_SCHEMA_VERSION };
