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

import Crypt from '@background/functions/Crypt.js';
import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { saveKeyRecord, getKeyRecord, deleteKeyRecord } from '@background/functions/cryptoKeyStore.js';
import { checkPromotionDurability, stampPromotion } from '@background/functions/keyPromotionDurability.js';

// The RSA-OAEP token-decryption private key. Persisted as a non-extractable
// CryptoKey in the shared cryptoKeyStore (IndexedDB) rather than as
// exportable base64 in storage.local; the storage.local pkcs8 fallback
// (legacy installs, or IndexedDB unavailable — Firefox permanent private
// browsing) is promoted back into IndexedDB with restart-proven durability
// (keyPromotionDurability) before the plaintext copy is stripped.
const PRIVATE_KEY_ID = 'privateKey';
const IDB_STAMP_KEY = 'privateKeyIdbStamp';

/**
 * Strips the legacy plaintext private key from storage.local, keeping every
 * other field of the keys object (public keys, the signing-key fallback).
 * Re-reads keys at write time so a stale caller snapshot cannot resurrect a
 * field another strip just removed. Idempotent — safe when nothing lingers.
 *
 * @async
 * @param {Object} storage - Fallback storage snapshot (used only if the fresh read fails).
 * @returns {Promise<void>}
 */
const stripLegacyPrivateKey = async storage => {
  let current = storage?.keys;

  try {
    const fresh = await loadFromLocalStorage(['keys']);

    current = fresh?.keys || current;
  } catch (e) {
    // Fall back to the caller's snapshot.
  }

  const keys = { ...(current || {}) };

  delete keys.privateKey;

  await saveToLocalStorage({ keys });
};

/**
 * Persists the private CryptoKey in IndexedDB, overwriting any previous one.
 *
 * @async
 * @param {CryptoKey} privateKey - A non-extractable RSA-OAEP private key.
 * @returns {Promise<void>}
 */
const savePrivateKey = privateKey => saveKeyRecord(PRIVATE_KEY_ID, privateKey);

/**
 * Reads the stored private CryptoKey, if any.
 *
 * @async
 * @returns {Promise<CryptoKey|undefined>} The key, or undefined when absent.
 */
const getPrivateKey = () => getKeyRecord(PRIVATE_KEY_ID);

/**
 * Removes the stored private CryptoKey (used when storage is reset/regenerated).
 *
 * @async
 * @returns {Promise<void>}
 */
const deletePrivateKey = () => deleteKeyRecord(PRIVATE_KEY_ID);

/**
 * Returns the private CryptoKey. A valid base64 key in storage.local (a legacy
 * install, or the fallback written when IndexedDB is unavailable — e.g. Firefox
 * with "Never remember history", where indexedDB.open throws for extension pages
 * too) always wins over the IndexedDB copy: when both exist and differ, the
 * IndexedDB one is a stale leftover of a reset that could not wipe it. The
 * storage.local key is imported as non-extractable and promoted into IndexedDB
 * best-effort.
 *
 * The plaintext copy is stripped from storage.local only once the promoted key
 * is observed in IndexedDB in a LATER browser session (tracked via
 * checkPromotionDurability): a put that resolves proves nothing about
 * persistence, and the imported key is non-extractable, so stripping on put
 * success can destroy the only recoverable copy.
 *
 * With no storage.local key, an IndexedDB failure still throws (never returns
 * null), so a transient error cannot masquerade as 'missingPrivateKey'.
 *
 * @async
 * @param {Object} storage - Storage object that may hold a keys.privateKey.
 * @returns {Promise<CryptoKey|null>} The private key, or null when none exists.
 */
const getOrMigratePrivateKey = async storage => {
  const legacy = storage?.keys?.privateKey;

  if (!legacy) {
    return (await getPrivateKey()) || null;
  }

  let existing = null;
  let idbError = null;

  try {
    existing = (await getPrivateKey()) || null;
  } catch (err) {
    idbError = err; // IndexedDB unavailable — storage.local stays authoritative
  }

  const durability = await checkPromotionDurability(legacy, IDB_STAMP_KEY);

  if (existing && durability.durable) {
    // The promoted copy survived a browser restart — safe to drop the plaintext
    // (and the now-purposeless stamp).
    await stripLegacyPrivateKey(storage);
    await removeFromLocalStorage(IDB_STAMP_KEY);

    return existing;
  }

  if (existing && durability.samePromotion) {
    // Promoted earlier in this same session — keep both copies until a later
    // session proves the IndexedDB write actually persisted.
    return existing;
  }

  const crypt = new Crypt();
  let imported = null;

  try {
    imported = await crypt.importKey(crypt.stringToArrayBuffer(legacy), 'pkcs8', ['decrypt']);
  } catch (err) {
    imported = null; // corrupt leftover — fall through to the IndexedDB key
  }

  if (imported) {
    try {
      await savePrivateKey(imported);
      await stampPromotion(durability, IDB_STAMP_KEY);
    } catch (err) {
      // IndexedDB unavailable — the storage.local copy stays authoritative.
    }

    return imported;
  }

  if (idbError) {
    throw idbError; // corrupt storage.local key AND broken IndexedDB — transient, never "missing"
  }

  if (existing) {
    // Corrupt plaintext leftover shadowing a valid IndexedDB key — drop it.
    await stripLegacyPrivateKey(storage);

    return existing;
  }

  return null;
};

export { savePrivateKey, getPrivateKey, deletePrivateKey, getOrMigratePrivateKey, PRIVATE_KEY_ID, IDB_STAMP_KEY };
