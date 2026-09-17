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

// Version of the `{v, publicKey}` companion record.
const META_RECORD_VERSION = 1;

/**
 * One persistence model for every private key the extension holds (the RSA-OAEP
 * token key, the ECDSA request-signing key). Two tiers, one read rule:
 *
 *  1. storage.local, pkcs8 base64 under `keys[storageField]` — installs ≤1.8.2,
 *     the IndexedDB-unavailable fallback (Firefox permanent private browsing,
 *     corrupted profile storage), or a platform where keyStoragePolicy prefers it
 *     (Safari, since 1.9.0).
 *  2. IndexedDB record `recordId` in cryptoKeyStore — a non-extractable CryptoKey.
 *     With a `metaRecordId`, a companion record `{v: 1, publicKey}` (the public
 *     half of that key) is written in the same strict transaction, so a lost
 *     `keys[publicField]` can be restored instead of regenerating the key.
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
 * @property {string} [metaRecordId] - cryptoKeyStore id of the `{v, publicKey}` companion record (IndexedDB tier only).
 * @property {string} storageField - `keys.<field>` holding the pkcs8 base64 copy.
 * @property {string} publicField - `keys.<field>` holding the public key.
 * @property {function(string): Promise<CryptoKey>} importKey - pkcs8 base64 → non-extractable CryptoKey.
 * @property {function(boolean, Object): Promise<CryptoKeyPair>} generatePair - (extractable, options) → pair.
 * @property {function(CryptoKey, Object): Promise<string>} exportPublic - public key → serialized string.
 * @property {function(CryptoKey, Object): Promise<string>} exportPrivate - private key → pkcs8 base64.
 * @property {function(Error): Promise<void>} logFallback - reports an IndexedDB failure that forced the fallback.
 */

/**
 * Whether a stored companion record is usable.
 *
 * @param {*} record - A value read from the companion record id.
 * @returns {boolean} True for an object carrying a non-empty public key string.
 */
const isMetaRecord = record => Boolean(record) &&
  typeof record === 'object' &&
  typeof record.publicKey === 'string' &&
  record.publicKey.length > 0;

/**
 * Builds the persistence API for one key.
 *
 * @param {KeyStoreSpec} spec
 * @returns {{
 *   save: function(CryptoKey): Promise<void>,
 *   get: function(): Promise<CryptoKey|undefined>,
 *   remove: function(): Promise<void>,
 *   resolve: function(Object): Promise<CryptoKey|null>,
 *   generateMaterial: function(Object=): Promise<Object>,
 *   getMeta: function(): Promise<{v: number, publicKey: string}|undefined>,
 *   saveMeta: function({publicKey: string}): Promise<void>
 * }}
 */
const createKeyStore = spec => {
  const companionIds = spec.metaRecordId ? [spec.metaRecordId] : [];
  const metaRecordFor = publicKey => ({ v: META_RECORD_VERSION, publicKey });

  const save = key => saveKeyRecord(spec.recordId, key);
  const get = () => getKeyRecord(spec.recordId);
  const remove = () => deleteKeyRecord(spec.recordId, { companions: companionIds });

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
   * CryptoKey in IndexedDB (plus its companion record) when the platform policy
   * prefers it and IndexedDB works, otherwise as pkcs8 base64 returned for
   * storage.local (`keys` object fields).
   *
   * Never destructive before the replacement exists: the IndexedDB put replaces
   * the previous record and companion in one strict transaction, and the
   * storage.local branch removes a stale record (best effort, so it can never
   * shadow the new key) only after both halves of the new pair are exported. A
   * failed generation leaves the previous key untouched.
   *
   * @async
   * @param {Object} [options={}] - Passed through to the spec's crypto callbacks.
   * @returns {Promise<Object>} `{ [publicField]: string, [storageField]?: string }`.
   */
  const generateMaterial = async (options = {}) => {
    let idbError = null;

    if (preferIdb()) {
      const pair = await spec.generatePair(false, options);
      const publicKey = await spec.exportPublic(pair.publicKey, options);
      const companions = spec.metaRecordId ? { [spec.metaRecordId]: metaRecordFor(publicKey) } : {};

      try {
        await saveKeyRecord(spec.recordId, pair.privateKey, { companions });

        return { [spec.publicField]: publicKey };
      } catch (err) {
        idbError = err;
      }
    }

    const pair = await spec.generatePair(true, options);
    const [publicKey, privateKey] = await Promise.all([
      spec.exportPublic(pair.publicKey, options),
      spec.exportPrivate(pair.privateKey, options)
    ]);

    // Fails on the broken IndexedDB that forced the fallback; harmless, because
    // the storage.local copy wins on every read.
    await remove().catch(() => {});

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

  /**
   * Reads the companion record of the IndexedDB key. Like every IndexedDB read
   * here it THROWS on an IndexedDB failure.
   *
   * @async
   * @returns {Promise<{v: number, publicKey: string}|undefined>} The record, or
   *   undefined when absent, malformed, or the key has no companion.
   */
  const getMeta = async () => {
    if (!spec.metaRecordId) {
      return undefined;
    }

    const record = await getKeyRecord(spec.metaRecordId);

    return isMetaRecord(record) ? record : undefined;
  };

  /**
   * Writes the companion record on its own (strict), e.g. to backfill it for a
   * key generated before companions existed. Rejects without writing when the
   * key has no companion or `publicKey` is not a non-empty string.
   *
   * @async
   * @param {{publicKey: string}} meta - The public half of the stored private key.
   * @returns {Promise<void>}
   */
  const saveMeta = async ({ publicKey } = {}) => {
    if (!spec.metaRecordId) {
      throw new Error(`keyStore: ${spec.recordId} has no companion record`);
    }

    if (typeof publicKey !== 'string' || !publicKey) {
      throw new TypeError('keyStore: a companion record needs a public key string');
    }

    await saveKeyRecord(spec.metaRecordId, metaRecordFor(publicKey));
  };

  return { save, get, remove, resolve, generateMaterial, getMeta, saveMeta };
};

export default createKeyStore;
