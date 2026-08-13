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

/* global indexedDB, crypto, TextEncoder */
import Crypt from '@background/functions/Crypt.js';
import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';

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

// Durability bookkeeping for the storage.local → IndexedDB promotion. A put that
// resolves proves nothing about persistence (ephemeral private-browsing databases
// accept writes that vanish on restart), so the plaintext copy in storage.local is
// stripped only after the promoted key is observed in IndexedDB in a LATER browser
// session. The stamp ({ fingerprint, sessionID }) lives in storage.local; the
// session marker lives in storage.session, which the browser clears on restart.
const IDB_STAMP_KEY = 'privateKeyIdbStamp';
const SESSION_ID_KEY = 'privateKeySessionID';

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

// Memoized so concurrent callers within one background instance agree on a single
// session marker; after a service-worker restart the marker is re-read from
// storage.session.
let sessionIDPromise = null;

/** Test-only: drops the memoized session marker to simulate a browser restart. */
const __resetSessionIDCacheForTests = () => {
  sessionIDPromise = null;
};

/**
 * Mints the session marker for the promotion durability check. Called from
 * runtime.onStartup ONLY: that event fires solely on a true browser start,
 * while storage.session is also cleared when the extension itself reloads or
 * updates mid-session — minting a marker there would fake the restart-survival
 * proof and allow a premature strip.
 *
 * @async
 * @returns {Promise<void>}
 */
const markBrowserSession = async () => {
  sessionIDPromise = null;
  await saveToSessionStorage({ [SESSION_ID_KEY]: crypto.randomUUID() });
};

/**
 * Returns the current session marker, or null when none was minted yet (browser
 * session started before this build, or the extension reloaded mid-session).
 * Absence is never cached — onStartup may mint a marker later.
 *
 * @async
 * @returns {Promise<?string>} The session marker, or null.
 */
const getSessionID = async () => {
  if (!sessionIDPromise) {
    sessionIDPromise = loadFromSessionStorage(SESSION_ID_KEY)
      .then(stored => stored?.[SESSION_ID_KEY] || null)
      .catch(() => null);
  }

  const id = await sessionIDPromise;

  if (!id) {
    sessionIDPromise = null;
  }

  return id;
};

/**
 * SHA-256 hex fingerprint of the base64 key string, identifying WHICH key a
 * promotion stamp refers to without storing the key material anywhere new.
 *
 * @async
 * @param {string} legacy - The base64 pkcs8 key from storage.local.
 * @returns {Promise<string>} Hex digest.
 */
const fingerprintKey = async legacy => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy));

  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Determines whether the storage.local key's promotion into IndexedDB has proven
 * durable: the stamp shows THIS key was saved to IndexedDB in a DIFFERENT browser
 * session, and the caller confirmed a key is present in IndexedDB now. Any failure
 * (storage.session unavailable, digest error) degrades to "not durable", which
 * only means the plaintext copy is kept — never data loss.
 *
 * @async
 * @param {string} legacy - The base64 key currently in storage.local.
 * @returns {Promise<{fingerprint: ?string, sessionID: ?string, durable: boolean, samePromotion: boolean}>}
 */
const checkPromotionDurability = async legacy => {
  try {
    const [fingerprint, sessionID, stored] = await Promise.all([
      fingerprintKey(legacy),
      getSessionID(),
      loadFromLocalStorage(IDB_STAMP_KEY)
    ]);
    const stamp = stored?.[IDB_STAMP_KEY];
    const sameKey = Boolean(stamp?.fingerprint && stamp.fingerprint === fingerprint && stamp?.sessionID);

    return {
      fingerprint,
      sessionID,
      // Without a minted marker (sessionID null) the current session is unknown —
      // that must never count as "a different session than the stamp's".
      durable: Boolean(sessionID) && sameKey && stamp.sessionID !== sessionID,
      samePromotion: Boolean(sessionID) && sameKey && stamp.sessionID === sessionID
    };
  } catch (err) {
    return { fingerprint: null, sessionID: null, durable: false, samePromotion: false };
  }
};

/**
 * Records that the given key was written to IndexedDB in the current session.
 * Skipped (best-effort) when the durability bookkeeping itself is unavailable.
 *
 * @async
 * @param {{fingerprint: ?string, sessionID: ?string}} durability
 * @returns {Promise<void>}
 */
const stampPromotion = async ({ fingerprint, sessionID }) => {
  if (!fingerprint || !sessionID) {
    return;
  }

  await saveToLocalStorage({ [IDB_STAMP_KEY]: { fingerprint, sessionID } });
};

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

  const durability = await checkPromotionDurability(legacy);

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
      await stampPromotion(durability);
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

export { savePrivateKey, getPrivateKey, deletePrivateKey, getOrMigratePrivateKey, markBrowserSession, __resetSessionIDCacheForTests };
