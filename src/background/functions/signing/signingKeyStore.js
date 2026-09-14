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

// The ECDSA P-256 request-signing private key (v1.9.0). Persistence rules live
// in keyStore.js: storage.local pkcs8 (`keys.signingPrivateKey`) wins when
// present and is used in place; otherwise the non-extractable CryptoKey record
// in IndexedDB. This module is also loaded by extension pages through the SDK,
// so storeLog is imported lazily (eager chunk) to keep the SDK → signing →
// storeLog → SDK cycle out of module evaluation.
const SIGNING_KEY_ID = 'signingPrivateKey';

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };

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
      console.error('signingKeyStore - fallback log failed', logErr);
    }
  }
});

/** @returns {Promise<void>} Persists the signing CryptoKey in IndexedDB. */
const saveSigningKey = key => signingKeyStore.save(key);

/** @returns {Promise<CryptoKey|undefined>} The IndexedDB signing key, or undefined. */
const getSigningKey = () => signingKeyStore.get();

/** @returns {Promise<void>} Removes the IndexedDB signing CryptoKey. */
const deleteSigningKey = () => signingKeyStore.remove();

/**
 * Generates the ECDSA P-256 signing keypair and persists the private half per
 * keyStoragePolicy (IndexedDB non-extractable, or the storage.local pkcs8
 * fallback — also used, with warning 67, when IndexedDB is unavailable).
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

export {
  importSigningKey,
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  saveSigningKey,
  getSigningKey,
  deleteSigningKey,
  SIGNING_KEY_ID
};
