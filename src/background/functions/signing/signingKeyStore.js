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
import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { saveKeyRecord, getKeyRecord, deleteKeyRecord } from '@background/functions/cryptoKeyStore.js';
import { checkPromotionDurability, stampPromotion } from '@background/functions/keyPromotionDurability.js';

// The ECDSA P-256 request-signing key. Same storage strategy as the RSA
// token key (privateKeyStore.js): preferred form is a non-extractable
// CryptoKey in the shared 'twofas'/'cryptoKeys' IndexedDB store; when
// IndexedDB is unavailable (Firefox permanent private browsing, corrupted
// profile storage) the fallback is an extractable pkcs8-base64 copy in
// storage.local (keys.signingPrivateKey), promoted back into IndexedDB with
// the same restart-proven durability rules before the plaintext is stripped.
const SIGNING_KEY_ID = 'signingPrivateKey';
const SIGNING_STAMP_KEY = 'signingKeyIdbStamp';

const ECDSA_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };

/**
 * Imports a pkcs8 ECDSA P-256 private key as non-extractable, sign-only.
 *
 * @async
 * @param {ArrayBuffer} pkcs8 - DER-encoded pkcs8 key material.
 * @returns {Promise<CryptoKey>}
 */
const importSigningKey = pkcs8 => crypto.subtle.importKey('pkcs8', pkcs8, ECDSA_PARAMS, false, ['sign']);

/** @returns {Promise<void>} Persists the signing CryptoKey in IndexedDB. */
const saveSigningKey = key => saveKeyRecord(SIGNING_KEY_ID, key);

/** @returns {Promise<CryptoKey|undefined>} The stored signing key, or undefined. */
const getSigningKey = () => getKeyRecord(SIGNING_KEY_ID);

/** @returns {Promise<void>} Removes the stored signing CryptoKey. */
const deleteSigningKey = () => deleteKeyRecord(SIGNING_KEY_ID);

/**
 * Strips the plaintext signing-key fallback from storage.local, preserving
 * every other field of the keys object. Re-reads keys at write time so a
 * stale caller snapshot cannot resurrect a field another strip just removed.
 * Idempotent.
 *
 * @async
 * @param {Object} storage - Fallback storage snapshot (used only if the fresh read fails).
 * @returns {Promise<void>}
 */
const stripLegacySigningKey = async storage => {
  let current = storage?.keys;

  try {
    const fresh = await loadFromLocalStorage(['keys']);

    current = fresh?.keys || current;
  } catch (e) {
    // Fall back to the caller's snapshot.
  }

  const keys = { ...(current || {}) };

  delete keys.signingPrivateKey;

  await saveToLocalStorage({ keys });
};

/**
 * Generates the ECDSA P-256 signing keypair and persists the private key.
 * Preferred: a non-extractable CryptoKey in IndexedDB. When IndexedDB is
 * unavailable, falls back to an extractable key exported as pkcs8 base64 for
 * storage.local (warning 67) — getOrMigrateSigningKey treats that copy as
 * authoritative and promotes it into IndexedDB automatically if IndexedDB
 * recovers.
 *
 * The public key is exported as SPKI and encoded with STANDARD base64 — the
 * backend decodes public_signing_key with Go's base64.StdEncoding, unlike the
 * per-request signature values which use padded base64url.
 *
 * @async
 * @returns {Promise<{signingPublicKey: string, signingPrivateKey?: string}>}
 *   Fields for the storage.local keys object.
 */
const generateSigningKeyMaterial = async () => {
  let idbError = null;

  try {
    await deleteSigningKey();
  } catch (err) {
    idbError = err;
  }

  if (!idbError) {
    const pair = await crypto.subtle.generateKey(ECDSA_PARAMS, false, ['sign', 'verify']);

    try {
      await saveSigningKey(pair.privateKey);

      return { signingPublicKey: ab2b64(await crypto.subtle.exportKey('spki', pair.publicKey)) };
    } catch (err) {
      idbError = err;
    }
  }

  const pair = await crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
  const [spki, pkcs8] = await Promise.all([
    crypto.subtle.exportKey('spki', pair.publicKey),
    crypto.subtle.exportKey('pkcs8', pair.privateKey)
  ]);

  try {
    // Dynamic import: storeLog reaches this module back through the SDK's
    // signing integration — a static import would create a require cycle.
    const { default: storeLog } = await import(/* webpackMode: "eager" */ '@partials/storeLog.js');
    await storeLog('warning', 67, idbError, 'signingKeyStore - IndexedDB unavailable, signing key stored in storage.local fallback');
  } catch (err) {
    console.error('signingKeyStore - fallback log failed', err);
  }

  return {
    signingPublicKey: ab2b64(spki),
    signingPrivateKey: ab2b64(pkcs8)
  };
};

/**
 * Returns the signing private CryptoKey. Mirrors getOrMigratePrivateKey
 * (privateKeyStore.js): a valid base64 pkcs8 key in storage.local always wins
 * over the IndexedDB copy, is imported non-extractable and promoted into
 * IndexedDB best-effort; the plaintext copy is stripped only once the
 * promotion has proven durable across a browser restart. With no
 * storage.local key, an IndexedDB failure still throws (never returns null),
 * so a transient error cannot masquerade as a missing key.
 *
 * @async
 * @param {Object} storage - Storage object that may hold keys.signingPrivateKey.
 * @returns {Promise<CryptoKey|null>} The signing key, or null when none exists.
 */
const getOrMigrateSigningKey = async storage => {
  const legacy = storage?.keys?.signingPrivateKey;

  if (!legacy) {
    return (await getSigningKey()) || null;
  }

  let existing = null;
  let idbError = null;

  try {
    existing = (await getSigningKey()) || null;
  } catch (err) {
    idbError = err; // IndexedDB unavailable — storage.local stays authoritative
  }

  const durability = await checkPromotionDurability(legacy, SIGNING_STAMP_KEY);

  if (existing && durability.durable) {
    await stripLegacySigningKey(storage);
    await removeFromLocalStorage(SIGNING_STAMP_KEY);

    return existing;
  }

  if (existing && durability.samePromotion) {
    return existing;
  }

  let imported = null;

  try {
    imported = await importSigningKey(b642ab(legacy));
  } catch (err) {
    imported = null; // corrupt leftover — fall through to the IndexedDB key
  }

  if (imported) {
    try {
      await saveSigningKey(imported);
      await stampPromotion(durability, SIGNING_STAMP_KEY);
    } catch (err) {
      // IndexedDB unavailable — the storage.local copy stays authoritative.
    }

    return imported;
  }

  if (idbError) {
    throw idbError; // corrupt storage.local key AND broken IndexedDB — transient, never "missing"
  }

  if (existing) {
    await stripLegacySigningKey(storage);

    return existing;
  }

  return null;
};

export {
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  saveSigningKey,
  getSigningKey,
  deleteSigningKey,
  SIGNING_KEY_ID,
  SIGNING_STAMP_KEY
};
