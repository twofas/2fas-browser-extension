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
//
// Every readwrite transaction requests 'strict' durability: it completes only
// once the write is flushed to disk (Chromium, Firefox 126+), so an OS crash
// right after a key write cannot roll the key back while storage.local already
// points at it. An engine that does not know the option ignores it.
//
// A key may carry companion records (the signing key's `signingKeyMeta`). They
// are written and deleted in the SAME transaction as the key, so the store never
// holds one without the other. Plain records, same store — no DB_VERSION bump.
const DB_NAME = 'twofas';
const DB_VERSION = 1;
const STORE_NAME = 'cryptoKeys';
const WRITE_OPTIONS = Object.freeze({ durability: 'strict' });

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
 * Runs requests against the key object store inside ONE transaction, resolving
 * with the result of the request `run` returns once the transaction commits,
 * and always closing the connection. Readwrite transactions request 'strict'
 * durability. When `run` throws (e.g. DataCloneError on a later put), the
 * transaction is aborted, so requests already issued in it never commit alone.
 *
 * @async
 * @param {IDBTransactionMode} mode - 'readonly' or 'readwrite'.
 * @param {function(IDBObjectStore): IDBRequest} run - Issues the requests on the store and returns the one to resolve with.
 * @returns {Promise<*>} The request result.
 */
const withStore = async (mode, run) => {
  const db = await openKeyDB();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = mode === 'readwrite'
        ? db.transaction(STORE_NAME, mode, WRITE_OPTIONS)
        : db.transaction(STORE_NAME, mode);
      let request;

      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('cryptoKeyStore: transaction aborted'));

      try {
        request = run(transaction.objectStore(STORE_NAME));
      } catch (err) {
        reject(err);

        try {
          transaction.abort();
        } catch (abortErr) {
          // Already finished or aborted — nothing left to roll back.
        }
      }
    });
  } finally {
    db.close();
  }
};

/**
 * Persists a CryptoKey record, overwriting any previous one under the same id,
 * together with its companion records — all in one strict transaction.
 *
 * @async
 * @param {string} id - Record id within the cryptoKeys store.
 * @param {CryptoKey|Object} key - A CryptoKey (or plain record) to persist (structured clone).
 * @param {Object} [options={}]
 * @param {Object<string, Object>} [options.companions={}] - Records to put in the same transaction, by record id.
 * @returns {Promise<void>}
 */
const saveKeyRecord = (id, key, { companions = {} } = {}) => withStore('readwrite', store => {
  const request = store.put(key, id);

  Object.entries(companions).forEach(([companionId, record]) => store.put(record, companionId));

  return request;
});

/**
 * Reads a stored CryptoKey record, if any.
 *
 * @async
 * @param {string} id - Record id within the cryptoKeys store.
 * @returns {Promise<CryptoKey|Object|undefined>} The record, or undefined when absent.
 */
const getKeyRecord = id => withStore('readonly', store => store.get(id));

/**
 * Removes a stored CryptoKey record and its companion records in one strict
 * transaction (used when storage is reset/regenerated).
 *
 * @async
 * @param {string} id - Record id within the cryptoKeys store.
 * @param {Object} [options={}]
 * @param {string[]} [options.companions=[]] - Companion record ids to delete in the same transaction.
 * @returns {Promise<void>}
 */
const deleteKeyRecord = (id, { companions = [] } = {}) => withStore('readwrite', store => {
  const request = store.delete(id);

  companions.forEach(companionId => store.delete(companionId));

  return request;
});

export { saveKeyRecord, getKeyRecord, deleteKeyRecord, DB_NAME, DB_VERSION, STORE_NAME };
