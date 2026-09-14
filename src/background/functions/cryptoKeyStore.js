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

// Generic CryptoKey persistence shared by every key the extension holds
// (the RSA-OAEP token key — privateKeyStore.js, the ECDSA request-signing
// key — signing/signingKeyStore.js). Keys are persisted as CryptoKey objects
// via the structured clone algorithm, which preserves the [[extractable]]
// slot — so a non-extractable key's raw material can never be read back
// through exportKey/wrapKey, is not returned by storage.local.get(null),
// and is not present in a plaintext profile file on disk.
//
// Records live in a dedicated object store fetched by primary key only —
// never through a secondary index — to avoid WebKit bug 177350 (a CryptoKey
// in an indexed record breaks IndexedDB queries on Safari). The background
// context is a service worker on Chromium and a page on Firefox/Safari;
// IndexedDB and this approach work in all of them.
const DB_NAME = 'twofas';
const DB_VERSION = 1;
const STORE_NAME = 'cryptoKeys';

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
  request.onblocked = () => reject(new Error('cryptoKeyStore: IndexedDB open blocked'));
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
      transaction.onabort = () => reject(transaction.error || new Error('cryptoKeyStore: transaction aborted'));
    });
  } finally {
    db.close();
  }
};

/**
 * Persists a CryptoKey record, overwriting any previous one under the same id.
 *
 * @async
 * @param {string} id - Record id within the cryptoKeys store.
 * @param {CryptoKey} key - A CryptoKey to persist (structured clone).
 * @returns {Promise<void>}
 */
const saveKeyRecord = (id, key) => withStore('readwrite', store => store.put(key, id));

/**
 * Reads a stored CryptoKey record, if any.
 *
 * @async
 * @param {string} id - Record id within the cryptoKeys store.
 * @returns {Promise<CryptoKey|undefined>} The key, or undefined when absent.
 */
const getKeyRecord = id => withStore('readonly', store => store.get(id));

/**
 * Removes a stored CryptoKey record (used when storage is reset/regenerated).
 *
 * @async
 * @param {string} id - Record id within the cryptoKeys store.
 * @returns {Promise<void>}
 */
const deleteKeyRecord = id => withStore('readwrite', store => store.delete(id));

export { saveKeyRecord, getKeyRecord, deleteKeyRecord, DB_NAME, DB_VERSION, STORE_NAME };
