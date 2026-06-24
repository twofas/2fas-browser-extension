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

/* global indexedDB */
import Crypt from '@background/functions/Crypt.js';
import { saveToLocalStorage } from '@localStorage/index.js';

// The RSA private key is persisted as a non-extractable CryptoKey object in
// IndexedDB rather than as exportable base64 in storage.local. IndexedDB stores
// it through the structured clone algorithm, which preserves the [[extractable]]
// slot — so the raw key material can never be read back through exportKey/wrapKey
// (they throw InvalidAccessError), is not returned by storage.local.get(null),
// and is not present in a plaintext profile file on disk.
//
// The key lives in a dedicated object store fetched by primary key only — never
// through a secondary index — to avoid WebKit bug 177350 (a CryptoKey in an
// indexed record breaks IndexedDB queries on Safari). The background context is
// a service worker on Chromium and a page on Firefox/Safari; IndexedDB and this
// approach work in all of them.
const DB_NAME = 'twofas';
const DB_VERSION = 1;
const STORE_NAME = 'cryptoKeys';
const PRIVATE_KEY_ID = 'privateKey';

/**
 * Opens (and lazily creates) the key IndexedDB database.
 *
 * @async
 * @returns {Promise<IDBDatabase>} The opened database connection.
 */
const openKeyDB = () => new Promise((resolve, reject) => {
  let request;

  try {
    request = indexedDB.open(DB_NAME, DB_VERSION);
  } catch (err) {
    reject(err);
    return;
  }

  request.onupgradeneeded = () => {
    const db = request.result;

    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('privateKeyStore: IndexedDB open blocked'));
});

/**
 * Runs a single request against the key object store inside its own transaction,
 * resolving with the request result and always closing the connection.
 *
 * @async
 * @param {IDBTransactionMode} mode - 'readonly' or 'readwrite'.
 * @param {function(IDBObjectStore): IDBRequest} run - Issues the request on the store.
 * @returns {Promise<*>} The request result.
 */
const withStore = async (mode, run) => {
  const db = await openKeyDB();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));

      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('privateKeyStore: transaction aborted'));
    });
  } finally {
    db.close();
  }
};

/**
 * Strips the legacy plaintext private key from storage.local, keeping the
 * (non-secret) public key. Idempotent — safe to call when nothing lingers.
 *
 * @async
 * @param {Object} storage - Storage object holding keys.publicKey.
 * @returns {Promise<void>}
 */
const stripLegacyPrivateKey = async storage => {
  await saveToLocalStorage({ keys: { publicKey: storage?.keys?.publicKey } });
};

/**
 * Persists the private CryptoKey in IndexedDB, overwriting any previous one.
 *
 * @async
 * @param {CryptoKey} privateKey - A non-extractable RSA-OAEP private key.
 * @returns {Promise<void>}
 */
const savePrivateKey = privateKey => withStore('readwrite', store => store.put(privateKey, PRIVATE_KEY_ID));

/**
 * Reads the stored private CryptoKey, if any.
 *
 * @async
 * @returns {Promise<CryptoKey|undefined>} The key, or undefined when absent.
 */
const getPrivateKey = () => withStore('readonly', store => store.get(PRIVATE_KEY_ID));

/**
 * Removes the stored private CryptoKey (used when storage is reset/regenerated).
 *
 * @async
 * @returns {Promise<void>}
 */
const deletePrivateKey = () => withStore('readwrite', store => store.delete(PRIVATE_KEY_ID));

/**
 * Returns the private CryptoKey, migrating an existing user's legacy base64 key
 * out of storage.local on first use. The migrated key is imported as
 * non-extractable, so the raw material never becomes exportable again. The
 * plaintext copy is stripped from storage.local once the key is in IndexedDB
 * (and re-stripped defensively if a previous run stored the key but failed to
 * remove the plaintext).
 *
 * @async
 * @param {Object} storage - Storage object that may hold a legacy keys.privateKey.
 * @returns {Promise<CryptoKey|null>} The private key, or null when none exists.
 */
const getOrMigratePrivateKey = async storage => {
  const existing = await getPrivateKey();
  const legacy = storage?.keys?.privateKey;

  if (existing) {
    if (legacy) {
      await stripLegacyPrivateKey(storage);
    }

    return existing;
  }

  if (!legacy) {
    return null;
  }

  const crypt = new Crypt();
  const privateKey = await crypt.importKey(crypt.stringToArrayBuffer(legacy), 'pkcs8', ['decrypt']);

  await savePrivateKey(privateKey);
  await stripLegacyPrivateKey(storage);

  return privateKey;
};

export { savePrivateKey, getPrivateKey, deletePrivateKey, getOrMigratePrivateKey };
