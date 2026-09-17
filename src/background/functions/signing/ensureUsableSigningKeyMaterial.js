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

import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';
import b642ab from '@background/functions/b642ab.js';
import { preferIdb } from '@background/functions/keyStoragePolicy.js';
import recoverSigningPublicKey from './recoverSigningPublicKey.js';
import {
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  getSigningKeyMeta,
  importSigningKey,
  isSigningKeyStoreWritable,
  saveSigningKeyMeta,
  signingKeyPairMatches,
  withKeyMaterialLock
} from './signingKeyStore.js';

// `code` of the error thrown when the key would have to be replaced while
// signing is active: the backend key cannot be changed, so a new one would
// only turn every signed request into a 401 (66).
const SIGNING_ACTIVE = 'SIGNING_ACTIVE';

// Log 74 `cause.outcome`: what became of the unusable key material.
const OUTCOME_KEPT = 'kept';
const OUTCOME_REGENERATED = 'regenerated';

// storage.local marker: the live signing private key has no known public half,
// so there is nothing to register — and, the backend never replacing a key,
// nothing to replace it with. Set with the write that drops the mismatched
// public key, cleared by every generation, wiped with the identity. Its only
// job is to report log 74 once instead of on every start.
const UNREGISTRABLE_KEY = 'signingKeyUnregistrable';

const FIRST_GENERATION = 'firstGeneration';
const LOG_CONTEXT = 'ensureUsableSigningKeyMaterial';

/**
 * A stored lineage counter, or 0 when it is absent or malformed.
 *
 * @param {*} value - The stored value.
 * @returns {number} A non-negative integer.
 */
const storedCount = value => (Number.isInteger(value) && value >= 0 ? value : 0);

/**
 * Whether a storage.local pkcs8 copy still imports.
 *
 * @async
 * @param {string} pkcs8 - `keys.signingPrivateKey`.
 * @returns {Promise<boolean>}
 */
const storedPkcs8Imports = async pkcs8 => {
  try {
    await importSigningKey(b642ab(pkcs8));

    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Writes the `signingKeyMeta` companion for a pair-verified IndexedDB key that
 * has none, or one naming another key (keys generated before 1.9.1). IndexedDB
 * policy only. Best effort: a missing companion only costs the restore path.
 *
 * @async
 * @param {string} signingPublicKey - The verified public key.
 * @returns {Promise<void>}
 */
const backfillSigningKeyMeta = async signingPublicKey => {
  if (!preferIdb()) {
    return;
  }

  try {
    const meta = await getSigningKeyMeta();

    if (meta?.publicKey !== signingPublicKey) {
      await saveSigningKeyMeta({ publicKey: signingPublicKey });
    }
  } catch (err) {
    // The key itself is usable; the companion is retried on the next reuse.
  }
};

/**
 * Compare-and-write into FRESH storage: re-reads storage.local and writes
 * `buildWrite(latest)` only while `keys.publicKey` (the RSA identity) is still
 * the one of `snapshot`. A reset or self-heal that replaced the identity in the
 * meantime keeps its keys; nothing stale is written back. A snapshot without an
 * RSA identity writes nothing either: that is storage a reset has just cleared,
 * and its own key section writes the keys (an absent key on both sides must not
 * pass for an unchanged identity).
 *
 * @async
 * @param {Object} snapshot - The storage read the decision was based on.
 * @param {function(Object): Object} buildWrite - Builds the set from the fresh read.
 * @returns {Promise<boolean>} Whether the write happened.
 */
const writeUnlessIdentityChanged = async (snapshot, buildWrite) => {
  if (!snapshot?.keys?.publicKey) {
    return false;
  }

  const latest = await loadFromLocalStorage(['keys', 'signingKeyGenerations']);

  if (latest?.keys?.publicKey !== snapshot?.keys?.publicKey) {
    return false;
  }

  await saveToLocalStorage(buildWrite(latest || {}));

  return true;
};

/**
 * Restores a lost or mismatched `keys.signingPublicKey` from the `signingKeyMeta`
 * companion when that record pairs with the surviving IndexedDB key: the
 * companion is written in the same strict transaction as the key, so it is the
 * public half the install last generated, while the storage.local copy is the
 * one that rolls back. A candidate only — pair-checked before it is trusted.
 *
 * @async
 * @param {Object} snapshot - The storage read the decision was based on.
 * @param {CryptoKey} survivor - The IndexedDB private key.
 * @returns {Promise<{result: Object, report: (Object|null)}|null>} The restore, or null when no companion pairs.
 */
const restoreFromCompanion = async (snapshot, survivor) => {
  const meta = await getSigningKeyMeta().catch(() => null);

  if (!meta?.publicKey || !(await signingKeyPairMatches(meta.publicKey, survivor))) {
    return null;
  }

  const persisted = await writeUnlessIdentityChanged(snapshot, latest => ({
    keys: { ...(latest.keys || {}), signingPublicKey: meta.publicKey },
    [UNREGISTRABLE_KEY]: false
  }));

  return {
    result: { signingPublicKey: meta.publicKey, regenerated: false, restored: true, persisted },
    report: persisted ? { restored: true, source: 'companion' } : null
  };
};

/**
 * Restores a lost or mismatched `keys.signingPublicKey` from the surviving
 * private key itself: its public half is recovered from two of its signatures
 * and confirmed by Web Crypto (recoverSigningPublicKey). The recovered key is
 * exactly the one the install may already have registered, so the normal keyed
 * PUT then confirms it (same key, no-op), registers it (first key) or reveals
 * the conflict (another key) — no probe, no replacement. The IndexedDB companion
 * is backfilled (best effort) so the next loss needs no recovery.
 *
 * @async
 * @param {Object} snapshot - The storage read the decision was based on.
 * @param {CryptoKey} survivor - The surviving private key.
 * @param {boolean} backfill - Whether the key lives in IndexedDB (companion tier).
 * @returns {Promise<{result: Object, report: (Object|null)}|null>} The restore, or null when nothing could be recovered.
 */
const restoreFromSignatures = async (snapshot, survivor, backfill) => {
  const derived = await recoverSigningPublicKey(survivor).catch(() => null);

  if (!derived) {
    return null;
  }

  const persisted = await writeUnlessIdentityChanged(snapshot, latest => ({
    keys: { ...(latest.keys || {}), signingPublicKey: derived },
    [UNREGISTRABLE_KEY]: false
  }));

  if (persisted && backfill) {
    await backfillSigningKeyMeta(derived);
  }

  return {
    result: { signingPublicKey: derived, regenerated: false, restored: true, persisted },
    report: persisted ? { restored: true, source: 'derived' } : null
  };
};

/**
 * The critical section: reuses, restores, keeps or regenerates the signing key.
 *
 * @async
 * @param {boolean} forNewIdentity - The key is for a row that does not exist yet
 *   (a create, or the re-registration after a 404): a fresh pair may replace
 *   anything, active signing included.
 * @returns {Promise<{result: Object, report: (Object|null)}>} The caller's result and what to log once the lock is released.
 * @throws {Error} `code: SIGNING_ACTIVE` when a regeneration is refused; storage and IndexedDB failures.
 */
const settleSigningKeyMaterial = async forNewIdentity => {
  const snapshot = await loadFromLocalStorage(['keys', 'signing', UNREGISTRABLE_KEY]);
  const storage = { keys: snapshot?.keys };
  const signingPublicKey = storage.keys?.signingPublicKey;
  const localPkcs8 = storage.keys?.signingPrivateKey;
  // A corrupt storage.local copy is skipped by the read rule (it falls through
  // to IndexedDB), so a key resolved behind it lives in IndexedDB.
  const pkcs8Usable = localPkcs8 ? await storedPkcs8Imports(localPkcs8) : false;
  // A private key this install still holds but cannot pair with a public key.
  // It may be the key the backend registered, and the backend never replaces a
  // key, so it stays the live key unless the identity itself is new.
  let survivor = null;
  let reason;

  if (signingPublicKey) {
    // Throws on an IndexedDB failure: never regenerate over a possibly-live key.
    const key = await getOrMigrateSigningKey(storage);

    if (key && await signingKeyPairMatches(signingPublicKey, key)) {
      if (!pkcs8Usable) {
        await backfillSigningKeyMeta(signingPublicKey);
      }

      return { result: { signingPublicKey, regenerated: false }, report: null };
    }

    survivor = key;
    reason = key ? 'pairMismatch' : 'privateMissing';
  } else {
    // Caught: an IndexedDB that cannot even be read (Firefox permanent private
    // browsing) must still reach the storage.local fallback of a generation.
    // A read that failed while the store still takes writes is transient: the
    // generation would overwrite (or, under the storage.local policy, delete) a
    // record nobody could read, possibly the registered key. That propagates
    // like the branch above (retry later).
    let readError = null;

    survivor = await getOrMigrateSigningKey(storage).catch(err => {
      readError = err;
      return null;
    });

    if (readError && await isSigningKeyStoreWritable()) {
      throw readError;
    }

    // No key and no public key, but the unregistrable marker: a kept survivor
    // was lost after its public key had been dropped — a loss to report (74),
    // not a first generation.
    reason = survivor ? 'publicMissing' : (snapshot?.[UNREGISTRABLE_KEY] === true ? 'privateMissing' : FIRST_GENERATION);
  }

  if (localPkcs8 && !pkcs8Usable) {
    reason = 'importFailed';
  }

  const survivorInIdb = !pkcs8Usable;

  // A restore is not a rekey: it may correct the public key while signing is
  // active, and it serves a new identity as well (a pair-checked key is reused).
  if (survivor) {
    const restored = (survivorInIdb ? await restoreFromCompanion(snapshot, survivor) : null) ||
      await restoreFromSignatures(snapshot, survivor, survivorInIdb);

    if (restored) {
      return restored;
    }
  }

  if (snapshot?.signing?.active && !forNewIdentity) {
    const refusal = new Error('Signing key unusable while signing is active; regeneration refused');
    refusal.code = SIGNING_ACTIVE;
    throw refusal;
  }

  if (survivor && !forNewIdentity) {
    // Fallback for a survivor whose public half could not even be recovered
    // (never for a real P-256 signing key): nothing pairs with it and nothing
    // may replace it, so it stays the live key, unregistrable. A public key that
    // does not pair with it is dropped — it must never be sent as this install's
    // key. Reported once.
    if (!signingPublicKey && snapshot?.[UNREGISTRABLE_KEY] === true) {
      return { result: { signingPublicKey: null, regenerated: false, registrable: false, persisted: false }, report: null };
    }

    const persisted = await writeUnlessIdentityChanged(snapshot, latest => {
      const keys = { ...(latest.keys || {}) };

      delete keys.signingPublicKey;

      return { keys, [UNREGISTRABLE_KEY]: true };
    });

    return {
      result: { signingPublicKey: null, regenerated: false, registrable: false, persisted },
      report: persisted ? { reason, outcome: OUTCOME_KEPT, storedIn: survivorInIdb ? 'idb' : 'local' } : null
    };
  }

  const fresh = await generateSigningKeyMaterial();
  const persisted = await writeUnlessIdentityChanged(snapshot, latest => {
    const keys = { ...(latest.keys || {}) };

    delete keys.signingPrivateKey;
    keys.signingPublicKey = fresh.signingPublicKey;

    if (fresh.signingPrivateKey) {
      keys.signingPrivateKey = fresh.signingPrivateKey;
    }

    // Key lineage for the log 64 diagnostics, in the same set as the key. A
    // regeneration replaces a key, so at least one generation came before it,
    // also for a key from before 1.9.1 that has no counter yet: counting from 0
    // there would report the lineage's first key, which reads as another copy's.
    const earlierGenerations = Math.max(storedCount(latest.signingKeyGenerations), reason === FIRST_GENERATION ? 0 : 1);

    return {
      keys,
      [UNREGISTRABLE_KEY]: false,
      signingKeyGeneratedAt: Date.now(),
      signingKeyGenerations: earlierGenerations + 1,
      signingKeySends: 0
    };
  });

  return {
    result: { signingPublicKey: fresh.signingPublicKey, regenerated: true, persisted },
    report: persisted && reason !== FIRST_GENERATION
      ? { reason, outcome: OUTCOME_REGENERATED, storedIn: fresh.signingPrivateKey ? 'local' : 'idb' }
      : null
  };
};

/**
 * Logs a restore (75), or a kept or regenerated unusable key (74). Enum-only
 * payloads; never a key. Best effort.
 *
 * @async
 * @param {Object|null} report - From settleSigningKeyMaterial.
 * @returns {Promise<void>}
 */
const reportSigningKeyMaterial = async report => {
  if (!report) {
    return;
  }

  try {
    if (report.restored) {
      await storeLog('warning', 75, new Error('Signing public key restored', { cause: { source: report.source } }), LOG_CONTEXT);
      return;
    }

    const message = report.outcome === OUTCOME_KEPT
      ? 'Unregistered signing key kept: its public half is unknown, nothing to register'
      : 'Unregistered signing key regenerated';

    await storeLog('warning', 74, new Error(message, {
      cause: { reason: report.reason, outcome: report.outcome, storedIn: report.storedIn }
    }), LOG_CONTEXT);
  } catch (err) {
    // Reporting never fails the key material, which is already settled.
  }
};

/**
 * Settles the signing keypair and returns what can be registered. Runs entirely
 * inside the key-material lock on a fresh read. The backend never replaces a
 * registered key (same key = no-op, another key = 400, no reset), so a private
 * key that may already be registered is never generated over:
 *
 *  1. A stored public key is reused only when it pair-checks against the private
 *     key (backfilling the IndexedDB companion record when missing).
 *  2. A lost or mismatched public key is restored: from the pair-verified
 *     companion record, else recovered from the private key's own signatures
 *     and confirmed by Web Crypto (log 75, `cause.source` companion | derived).
 *     The normal keyed PUT then confirms, registers or reveals a conflict for
 *     it — before the backend ever requires signatures.
 *  3. Fallback only (never for a real P-256 key): a surviving private key whose
 *     public half could not be recovered stays the live key, unregistrable: the
 *     mismatched public key is dropped, `registrable: false` and
 *     `signingPublicKey: null` come back, log 74 `outcome: 'kept'` is sent
 *     once. Callers send no key for it. It signs as soon as the backend
 *     challenges the install (signingState `challenged`).
 *  4. Only when no private key survived (or the storage.local copy is corrupt
 *     with nothing behind it), or for a new identity (`forNewIdentity`: a
 *     create, or the re-registration after a 404, whose row and key are gone),
 *     is a fresh pair generated — refused with `code: SIGNING_ACTIVE` while
 *     signing is active unless `forNewIdentity` — and compare-and-written into
 *     fresh keys, skipped when a reset replaced the identity meantime
 *     (`persisted: false`). Log 74 `outcome: 'regenerated'`.
 *
 * A transient IndexedDB error propagates (retry later) instead of triggering a
 * regeneration: always while a public key is stored, and without one whenever
 * IndexedDB still takes writes (only an unusable IndexedDB, e.g. Firefox
 * permanent private browsing, generates into the storage.local fallback). Logs
 * 74/75 are sent after the lock is released.
 *
 * @async
 * @param {Object} [options={}]
 * @param {boolean} [options.forNewIdentity=false] - The key is for a row that does not exist yet.
 * @returns {Promise<{signingPublicKey: ?string, regenerated: boolean, registrable?: boolean, restored?: boolean, persisted?: boolean}>}
 * @throws {Error} `code: SIGNING_ACTIVE` when a regeneration is refused; storage and IndexedDB failures.
 */
const ensureUsableSigningKeyMaterial = async ({ forNewIdentity = false } = {}) => {
  const { result, report } = await withKeyMaterialLock(() => settleSigningKeyMaterial(forNewIdentity));

  await reportSigningKeyMaterial(report);

  return result;
};

export default ensureUsableSigningKeyMaterial;
export { SIGNING_ACTIVE, UNREGISTRABLE_KEY };
