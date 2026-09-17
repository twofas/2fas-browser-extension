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

/* global crypto */
import ab2b64 from '@background/functions/ab2b64.js';
import b642ab from '@background/functions/b642ab.js';
import createKeyStore from '@background/functions/keyStore.js';
import { deleteKeyRecord, saveKeyRecord } from '@background/functions/cryptoKeyStore.js';
import safeConsole from '@partials/safeConsole.js';

// The ECDSA P-256 request-signing private key (v1.9.0). Persistence rules live
// in keyStore.js: storage.local pkcs8 (`keys.signingPrivateKey`) wins when
// present and is used in place; otherwise the non-extractable CryptoKey record
// in IndexedDB. This module is also loaded by extension pages through the SDK,
// so storeLog is imported lazily (eager chunk) to keep the SDK → signing →
// storeLog → SDK cycle out of module evaluation.
const SIGNING_KEY_ID = 'signingPrivateKey';

// IndexedDB companion of SIGNING_KEY_ID (1.9.1): `{v: 1, publicKey}` — the SPKI
// of the stored private key, written in the same strict transaction. IndexedDB
// tier only (never on Safari's storage.local policy); it holds nothing but our
// own public key and lets a lost `keys.signingPublicKey` be restored.
const SIGNING_KEY_META_ID = 'signingKeyMeta';

// A plain `{v: 1}` record written and deleted again to learn whether the key
// store still takes writes (see isSigningKeyStoreWritable). No key material.
const SIGNING_KEY_WRITE_PROBE_ID = 'signingKeyWriteProbe';

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDSA_SIGN_PARAMS = { name: 'ECDSA', hash: { name: 'SHA-256' } };

// Fixed bytes signed and verified by the pair check. Nothing secret, never sent.
const PAIR_CHECK_PROBE = new TextEncoder().encode('2FAS signing key pair check');

// Serializes every writer of signing key material in this context (the
// background): ensureUsableSigningKeyMaterial runs entirely inside it and
// generateDefaultStorage runs its key section inside it, so two generations
// never interleave (M5/M12) and a reset's keys write never lands between an
// ensure's snapshot and its write-back (M13). Same shape as the signing-state
// lock: a rejection never wedges the queue. Not reentrant: nothing inside it
// may await a registration enqueue or flush (the flush ensures the key).
let keyMaterialQueue = Promise.resolve();

/**
 * Runs `fn` once every earlier caller of the key-material lock has settled.
 *
 * @template T
 * @param {function(): (T|Promise<T>)} fn - The critical section.
 * @returns {Promise<T>} Settles like `fn`.
 */
const withKeyMaterialLock = fn => {
  const run = keyMaterialQueue.then(() => fn());

  keyMaterialQueue = run.catch(() => {});

  return run;
};

/**
 * Whether `signingPublicKey` is the public half of `privateKey`: signs fixed
 * probe bytes with the private key and verifies them with the public key.
 * Logs nothing.
 *
 * @async
 * @param {string} signingPublicKey - SPKI, standard base64.
 * @param {CryptoKey} privateKey - ECDSA P-256 private key with the 'sign' usage.
 * @returns {Promise<boolean>} False also when the public key does not import as P-256 SPKI.
 * @throws {Error} When signing or verifying itself fails (e.g. not a signing key).
 */
const signingKeyPairMatches = async (signingPublicKey, privateKey) => {
  let publicKey;

  try {
    publicKey = await crypto.subtle.importKey('spki', b642ab(signingPublicKey), ECDSA_PARAMS, false, ['verify']);
  } catch (err) {
    return false;
  }

  const signature = await crypto.subtle.sign(ECDSA_SIGN_PARAMS, privateKey, PAIR_CHECK_PROBE);

  return crypto.subtle.verify(ECDSA_SIGN_PARAMS, publicKey, signature, PAIR_CHECK_PROBE);
};

/**
 * Imports a pkcs8 ECDSA P-256 private key as non-extractable, sign-only.
 *
 * @async
 * @param {ArrayBuffer} pkcs8 - DER-encoded pkcs8 key material.
 * @returns {Promise<CryptoKey>}
 */
const importSigningKey = pkcs8 => crypto.subtle.importKey('pkcs8', pkcs8, ECDSA_PARAMS, false, ['sign']);

const signingKeyStore = createKeyStore({
  recordId: SIGNING_KEY_ID,
  metaRecordId: SIGNING_KEY_META_ID,
  storageField: 'signingPrivateKey',
  publicField: 'signingPublicKey',
  importKey: base64 => importSigningKey(b642ab(base64)),
  generatePair: extractable => crypto.subtle.generateKey(ECDSA_PARAMS, extractable, ['sign', 'verify']),
  // STANDARD base64 — the backend decodes public_signing_key with Go's
  // base64.StdEncoding, unlike the per-request signature values (padded base64url).
  exportPublic: async key => ab2b64(await crypto.subtle.exportKey('spki', key)),
  exportPrivate: async key => ab2b64(await crypto.subtle.exportKey('pkcs8', key)),
  logFallback: async err => {
    try {
      const { default: storeLog } = await import(/* webpackMode: "eager" */ '@partials/storeLog.js');
      await storeLog('warning', 67, err, 'signingKeyStore - IndexedDB unavailable, signing key stored in storage.local fallback');
    } catch (logErr) {
      safeConsole.error('signingKeyStore - fallback log failed', logErr);
    }
  }
});

/** @returns {Promise<void>} Persists the signing CryptoKey in IndexedDB (without a companion record). */
const saveSigningKey = key => signingKeyStore.save(key);

/** @returns {Promise<CryptoKey|undefined>} The IndexedDB signing key, or undefined. */
const getSigningKey = () => signingKeyStore.get();

/** @returns {Promise<void>} Removes the IndexedDB signing CryptoKey and its companion record. */
const deleteSigningKey = () => signingKeyStore.remove();

/**
 * Generates the ECDSA P-256 signing keypair and persists the private half per
 * keyStoragePolicy (IndexedDB non-extractable together with its `signingKeyMeta`
 * companion, or the storage.local pkcs8 fallback — also used, with warning 67,
 * when IndexedDB is unavailable). A failed generation leaves the previous key.
 *
 * @async
 * @returns {Promise<{signingPublicKey: string, signingPrivateKey?: string}>}
 *   Fields for the storage.local keys object.
 */
const generateSigningKeyMaterial = () => signingKeyStore.generateMaterial();

/**
 * Returns the usable signing key: the storage.local pkcs8 copy (imported
 * non-extractable, used in place — never promoted, never stripped) when present,
 * otherwise the IndexedDB record. Throws on an IndexedDB failure when no
 * storage.local copy exists, so a transient error never reads as "missing".
 *
 * @async
 * @param {Object} storage - Storage snapshot that may hold `keys.signingPrivateKey`.
 * @returns {Promise<CryptoKey|null>}
 */
const getOrMigrateSigningKey = storage => signingKeyStore.resolve(storage);

/**
 * Reads the `signingKeyMeta` companion record. Throws on an IndexedDB failure.
 * The public key in it is only a candidate: pair-check it against the private
 * key before trusting it.
 *
 * @async
 * @returns {Promise<{v: number, publicKey: string}|undefined>} The record, or
 *   undefined when absent or malformed.
 */
const getSigningKeyMeta = () => signingKeyStore.getMeta();

/**
 * Writes the `signingKeyMeta` companion record on its own (strict durability),
 * e.g. to backfill it for a key generated before 1.9.1. Rejects without writing
 * when `publicKey` is not a non-empty string.
 *
 * @async
 * @param {{publicKey: string}} meta - SPKI (standard base64) of the stored signing private key.
 * @returns {Promise<void>}
 */
const saveSigningKeyMeta = meta => signingKeyStore.saveMeta(meta);

/**
 * Whether the key IndexedDB takes writes right now: writes a plain probe record
 * and deletes it again (best effort). Tells a transient read failure (the store
 * still writes, so a generation would overwrite a record nobody could read) from
 * an IndexedDB that is unusable (Firefox permanent private browsing), where a
 * generation must still reach its storage.local fallback. Never throws.
 *
 * @async
 * @returns {Promise<boolean>}
 */
const isSigningKeyStoreWritable = async () => {
  try {
    await saveKeyRecord(SIGNING_KEY_WRITE_PROBE_ID, { v: 1 });
  } catch (err) {
    return false;
  }

  await deleteKeyRecord(SIGNING_KEY_WRITE_PROBE_ID).catch(() => {});

  return true;
};

export {
  importSigningKey,
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  saveSigningKey,
  getSigningKey,
  deleteSigningKey,
  getSigningKeyMeta,
  saveSigningKeyMeta,
  isSigningKeyStoreWritable,
  signingKeyPairMatches,
  withKeyMaterialLock,
  SIGNING_KEY_ID,
  SIGNING_KEY_META_ID
};
