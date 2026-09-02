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

import { saveKeyRecord, getKeyRecord, deleteKeyRecord } from '@background/functions/cryptoKeyStore.js';
import { preferIdb } from '@background/functions/keyStoragePolicy.js';

/**
 * One persistence model for every private key the extension holds (the RSA-OAEP
 * token key, the ECDSA request-signing key). Two tiers, one read rule:
 *
 *  1. storage.local, pkcs8 base64 under `keys[storageField]` — installs ≤1.8.2,
 *     the IndexedDB-unavailable fallback (Firefox permanent private browsing,
 *     corrupted profile storage), or a platform where keyStoragePolicy prefers it
 *     (Safari, since 1.9.0).
 *  2. IndexedDB record `recordId` in cryptoKeyStore — a non-extractable CryptoKey.
 *
 * A key in storage.local ALWAYS wins and is used in place: imported non-extractable
 * on every read, never promoted into IndexedDB, never stripped. (When both exist
 * and differ, the IndexedDB copy is a stale leftover of a reset that could not
 * wipe it.) The former promote-and-strip-after-restart-proof machinery is gone:
 * every incident it caused came from moving keys between the two tiers, and
 * stripping buys nothing against an attacker who already had the plaintext.
 *
 * With no storage.local key an IndexedDB failure still THROWS (never resolves
 * null), so a transient error can never masquerade as "key missing" — callers
 * (verifyStorageIntegrity, flushBrowserRegistration, handleLoginRequest) rely on it.
 *
 * @typedef {Object} KeyStoreSpec
 * @property {string} recordId - cryptoKeyStore record id.
 * @property {string} storageField - `keys.<field>` holding the pkcs8 base64 copy.
 * @property {string} publicField - `keys.<field>` holding the public key.
 * @property {function(string): Promise<CryptoKey>} importKey - pkcs8 base64 → non-extractable CryptoKey.
 * @property {function(boolean, Object): Promise<CryptoKeyPair>} generatePair - (extractable, options) → pair.
 * @property {function(CryptoKey, Object): Promise<string>} exportPublic - public key → serialized string.
 * @property {function(CryptoKey, Object): Promise<string>} exportPrivate - private key → pkcs8 base64.
 * @property {function(Error): Promise<void>} logFallback - reports an IndexedDB failure that forced the fallback.
 */

/**
 * Builds the persistence API for one key.
 *
 * @param {KeyStoreSpec} spec
 * @returns {{
 *   save: function(CryptoKey): Promise<void>,
 *   get: function(): Promise<CryptoKey|undefined>,
 *   remove: function(): Promise<void>,
 *   resolve: function(Object): Promise<CryptoKey|null>,
 *   generateMaterial: function(Object=): Promise<Object>
 * }}
 */
const createKeyStore = spec => {
  const save = key => saveKeyRecord(spec.recordId, key);
  const get = () => getKeyRecord(spec.recordId);
  const remove = () => deleteKeyRecord(spec.recordId);

  /**
   * Returns the private key per the read rule above.
   *
   * @async
   * @param {Object} storage - Storage snapshot that may hold `keys[storageField]`.
   * @returns {Promise<CryptoKey|null>} The key, or null when none exists anywhere.
   */
  const resolve = async storage => {
    const local = storage?.keys?.[spec.storageField];

    if (local) {
      try {
        return await spec.importKey(local);
      } catch (err) {
        // Corrupt leftover — fall through to IndexedDB. Left untouched: the read
        // path never writes to storage.
      }
    }

    return (await get()) || null;
  };

  /**
   * Generates a fresh keypair and persists the private half: as a non-extractable
   * CryptoKey in IndexedDB when the platform policy prefers it and IndexedDB
   * works, otherwise as pkcs8 base64 returned for storage.local (`keys` object
   * fields). Any stale IndexedDB record is removed first (best effort), so a
   * reset can never leave an old key shadowing the new one.
   *
   * @async
   * @param {Object} [options={}] - Passed through to the spec's crypto callbacks.
   * @returns {Promise<Object>} `{ [publicField]: string, [storageField]?: string }`.
   */
  const generateMaterial = async (options = {}) => {
    let idbError = null;

    try {
      await remove();
    } catch (err) {
      idbError = err;
    }

    if (preferIdb() && !idbError) {
      const pair = await spec.generatePair(false, options);

      try {
        await save(pair.privateKey);

        return { [spec.publicField]: await spec.exportPublic(pair.publicKey, options) };
      } catch (err) {
        idbError = err;
      }
    }

    const pair = await spec.generatePair(true, options);
    const [publicKey, privateKey] = await Promise.all([
      spec.exportPublic(pair.publicKey, options),
      spec.exportPrivate(pair.privateKey, options)
    ]);

    // A fallback forced by a broken IndexedDB is worth a log; one chosen by
    // policy is not.
    if (preferIdb() && idbError) {
      await spec.logFallback(idbError);
    }

    return {
      [spec.publicField]: publicKey,
      [spec.storageField]: privateKey
    };
  };

  return { save, get, remove, resolve, generateMaterial };
};

export default createKeyStore;
