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

/**
 * Wraps an IndexedDB private-key store rejection with a marker so the catch treats
 * it as a transient/retryable condition (retry on next startup) rather than the
 * terminal error-28. Applied to EVERY IndexedDB op in the chain — both the initial
 * deletePrivateKey and the later savePrivateKey go through the same openKeyDB, and
 * when IndexedDB is entirely unavailable (Firefox dom.indexedDB disabled, policy)
 * the delete fails FIRST, so tagging only the save would miss the flagship case.
 * @param {Error} err - The raw rejection from a privateKeyStore op.
 * @returns {Error} A tagged error.
 */
const tagIndexedDBError = err => {
  const tagged = new Error(`IndexedDB private-key store unavailable: ${err?.message || err}`);
  tagged.name = 'PrivateKeyStoreUnavailable';
  tagged.isIndexedDBError = true;
  return tagged;
};

export default tagIndexedDBError;
