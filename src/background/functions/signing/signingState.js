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

import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { BACKEND_ERROR_TYPES } from '@partials/describeBackendError.js';
import safeConsole from '@partials/safeConsole.js';
import config from '@/config.js';
// Static on purpose: signingRepairNotice pulls nothing from the storeLog → SDK
// cycle, runs no browser API at load time, and is never called from a content
// script (this module reaches the content bundle through storeLog).
import deliverSigningRepairNotice from './signingRepairNotice.js';

/**
 * Request-signing lifecycle state, kept in storage.local under 'signing':
 *
 *  - active               : the public signing key is confirmed registered with the
 *                           backend — every protected request is signed from now on.
 *  - conflict             : the backend holds a DIFFERENT public signing key for this
 *                           extensionID (key replacement is not supported server-side).
 *                           Requests stay unsigned; the user must Reset and re-pair.
 *  - registrationRequired : the backend rejects this extension's requests (migration
 *                           window closed without a registered key, or persistent 401
 *                           while signing) — the user must Reset and re-pair.
 *  - auth401Count         : consecutive-401 counter feeding registrationRequired.
 *  - challenged           : the backend rejected an UNSIGNED request while signing
 *                           was not active — it verifies this row now. From then on
 *                           every request is signed with the key the install holds
 *                           (a key it sent but whose activation was never recorded);
 *                           the first verified success activates signing. No extra
 *                           request is ever sent for this, and no request is rejected
 *                           that would not have been rejected unsigned.
 *
 * All states are derived purely from API responses — the extension never
 * hardcodes the migration-window deadline.
 */
const SIGNING_STORAGE_KEY = 'signing';

/** Consecutive 401s before the extension concludes re-registration is required. */
const AUTH_401_THRESHOLD = 3;

// One-shot notification flags (mirror reportMissingPrivateKey's dedup): the
// broken state persists until the user re-pairs, and must not re-notify on
// every request or update event.
const SIGNING_REQUIRED_REPORTED_FLAG = 'signingRequiredReported';
const SIGNING_CONFLICT_REPORTED_FLAG = 'signingConflictReported';

// The extensionID log 64 was last reported for. Durable per identity: clearing
// `conflict` does not re-arm the log, a new extensionID does. An identity field,
// not a preference — every regeneration wipes it with the rest of storage.local.
const SIGNING_CONFLICT_LOGGED_FOR_KEY = 'signingConflictLoggedFor';

/** @returns {Object} A fresh default signing-state object. */
const defaultSigningState = () => ({
  active: false,
  conflict: false,
  registrationRequired: false,
  auth401Count: 0,
  challenged: false
});

/**
 * Loads the signing state, filling in defaults for missing fields (installs
 * migrated before the field existed, partial writes). Strict: a failed read
 * rejects, so a caller that writes the state back can never persist defaults
 * over a state it could not see (e.g. drop active:true).
 *
 * @async
 * @returns {Promise<Object>}
 * @throws {Error} When storage.local cannot be read.
 */
const readSigningState = async () => {
  const stored = await loadFromLocalStorage(SIGNING_STORAGE_KEY);

  return { ...defaultSigningState(), ...(stored?.[SIGNING_STORAGE_KEY] || {}) };
};

/**
 * Loads the signing state for read-only callers: a failed read yields the
 * defaults. Never write its result back — mutations use readSigningState.
 *
 * @async
 * @returns {Promise<Object>}
 */
const getSigningState = async () => {
  try {
    return await readSigningState();
  } catch (err) {
    return defaultSigningState();
  }
};

// Serializes every read-modify-write of the signing object within this
// context: the SDK response tap, the durable-registration commit and the
// conflict marker all mutate it, and an interleaved stale-snapshot write
// could silently drop a concurrent transition (e.g. lose active:true to a
// tap's counter reset). Rejections never wedge the queue.
let signingWriteQueue = Promise.resolve();

const withSigningLock = fn => {
  const run = signingWriteQueue.then(fn, fn);

  signingWriteQueue = run.catch(() => {});

  return run;
};

/**
 * Merges a patch into the stored signing state. The fresh state is read
 * strictly inside the per-context mutation lock, so queued patches never
 * overwrite each other's fields, and a failed read rejects before anything is
 * written.
 *
 * @async
 * @param {Object} patch - Fields to change.
 * @returns {Promise<Object>} The new state.
 * @throws {Error} When storage.local cannot be read or written; nothing is written then.
 */
const patchSigningState = patch => withSigningLock(async () => {
  const state = { ...(await readSigningState()), ...patch };

  await saveToLocalStorage({ [SIGNING_STORAGE_KEY]: state });

  return state;
});

/**
 * Marks the signing key as confirmed-registered: from now on every protected
 * request is signed. Activation replaces every signing-state field, so it
 * needs no read and a failing read cannot lose it. `extra` lands in the same
 * storage.local set, which lets a registration commit clear its pending record
 * and activate signing atomically. Serialized like every other signing-state
 * mutation.
 *
 * @async
 * @param {Object} [extra={}] - Other storage.local fields to write in the same set.
 *   A `signing` field in it never overrides the activation.
 * @returns {Promise<Object>} The new state.
 */
const activateSigning = (extra = {}) => withSigningLock(async () => {
  const state = { ...defaultSigningState(), active: true };

  await saveToLocalStorage({ ...extra, [SIGNING_STORAGE_KEY]: state });

  return state;
});

/**
 * Emits the one-shot "re-registration required" report: log 66 plus a
 * user-facing notification prompting a Reset and re-pair.
 *
 * @async
 * @returns {Promise<void>}
 */
const reportSigningRequired = async () => {
  try {
    const flagged = await loadFromLocalStorage(SIGNING_REQUIRED_REPORTED_FLAG);

    if (flagged?.[SIGNING_REQUIRED_REPORTED_FLAG]) {
      return;
    }

    // Dynamic imports: storeLog reaches this module back through the SDK — a
    // static import would create a require cycle.
    try {
      const { default: storeLog } = await import(/* webpackMode: "eager" */ '@partials/storeLog.js');
      await storeLog(
        'error',
        66,
        { message: 'Backend rejects requests as unsigned/invalid — re-registration required' },
        'signingState - reportSigningRequired'
      );
    } catch (err) {
      safeConsole.error('signingState - reportSigningRequired log', err);
    }

    // A conflicted install already heard "Re-pairing required" — keep the
    // same wording when the window closing merely confirms that verdict. The
    // notice is delivered the way the reminder delivers it (native push, or the
    // active tab's content script), and a delivered notice counts as this
    // version's reminder; one that found no page is left to the reminder. The
    // one-shot flag is set either way: the state is permanent until the Reset.
    const state = await getSigningState();
    const text = state.conflict ? config.Texts.Error.SigningKeyConflict : config.Texts.Error.SigningRequired;

    await deliverSigningRepairNotice(text);
    await saveToLocalStorage({ [SIGNING_REQUIRED_REPORTED_FLAG]: true });
  } catch (err) {
    safeConsole.error('signingState - reportSigningRequired', err);
  }
};

/** Log 64 message. Constant: the backend Reason names both public keys and is never forwarded. */
const SIGNING_CONFLICT_LOG_MESSAGE = 'Signing key conflict: backend holds a different public signing key';

// Exclusive upper bounds (ms) of the coarse age buckets reported with log 64.
const AGE_BUCKET_LIMITS = [
  ['<1m', 60 * 1000],
  ['<1h', 60 * 60 * 1000],
  ['<1d', 24 * 60 * 60 * 1000],
  ['<7d', 7 * 24 * 60 * 60 * 1000]
];
const AGE_BUCKETS = [...AGE_BUCKET_LIMITS.map(([bucket]) => bucket), '>=7d', 'unknown'];

// A committed extensionVersion is a plain release number; anything else reports as 'other'.
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;
const MAX_RELEASE_VERSION_LENGTH = 32;

/**
 * Maps an age to a coarse bucket, so log 64 can tell how old a key or a pending
 * record was without carrying a timestamp.
 *
 * @param {number} ms - Age in milliseconds.
 * @returns {'<1m'|'<1h'|'<1d'|'<7d'|'>=7d'|'unknown'} 'unknown' for anything but a non-negative finite number.
 */
const ageBucket = ms => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return 'unknown';
  }

  const bucket = AGE_BUCKET_LIMITS.find(([, limit]) => ms < limit);

  return bucket ? bucket[0] : '>=7d';
};

/** @returns {number|null} A non-negative integer counter, else null. */
const toCounter = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);

/** @returns {string} A known age bucket, else 'unknown'. */
const toAgeBucket = value => (AGE_BUCKETS.includes(value) ? value : 'unknown');

/** @returns {string|null} A release version, 'other' for any other stored value, null when absent. */
const toReleaseVersion = value => {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === 'string' && value.length <= MAX_RELEASE_VERSION_LENGTH && RELEASE_VERSION.test(value) ? value : 'other';
};

/**
 * Builds the log-64 payload from typed fields only. The backend content, its
 * Reason and Description, and the request url are never copied: the conflict
 * Reason names the stored and the rejected public signing key.
 *
 * The cause separates "another copy of this identity set the key" from "this
 * install regenerated a key it had already sent", without any key, fingerprint
 * or hash. Fields that are missing or not of the expected type become null
 * (counters, version) or 'unknown' (buckets).
 *
 * @param {*} err - The normalized SDK error that revealed the conflict.
 * @param {Object} [diagnostics] - Key-free context of the failing request.
 * @param {number} [diagnostics.keyGenerations] - Signing keys generated by this identity lineage.
 * @param {number} [diagnostics.sendsWithThisKey] - Keyed requests sent with the current key before the failing one.
 * @param {string} [diagnostics.keyAgeBucket] - ageBucket of the current signing key.
 * @param {number} [diagnostics.recordAttempts] - attempts of the failing registration record.
 * @param {string} [diagnostics.recordAgeBucket] - ageBucket of the failing record's firstAttemptAt.
 * @param {string} [diagnostics.storedExtensionVersion] - Last committed storage.local extensionVersion.
 * @returns {Object} The log payload.
 */
const conflictLogInfo = (err, diagnostics = {}) => {
  const source = err && typeof err === 'object' ? err : {};
  const content = source.content && typeof source.content === 'object' ? source.content : {};
  const context = diagnostics && typeof diagnostics === 'object' ? diagnostics : {};
  const type = content.Type;

  return {
    message: SIGNING_CONFLICT_LOG_MESSAGE,
    status: typeof source.status === 'number' && Number.isFinite(source.status) ? source.status : null,
    statusText: typeof source.statusText === 'string' ? source.statusText : null,
    signed: typeof source.signed === 'boolean' ? source.signed : null,
    backendCode: Number.isSafeInteger(content.Code) ? content.Code : null,
    backendType: (type === undefined || type === null) ? null : (BACKEND_ERROR_TYPES.includes(type) ? type : 'other'),
    cause: {
      keyGenerations: toCounter(context.keyGenerations),
      sendsWithThisKey: toCounter(context.sendsWithThisKey),
      keyAgeBucket: toAgeBucket(context.keyAgeBucket),
      recordAttempts: toCounter(context.recordAttempts),
      recordAgeBucket: toAgeBucket(context.recordAgeBucket),
      storedExtensionVersion: toReleaseVersion(context.storedExtensionVersion)
    }
  };
};

/**
 * Reads the identity counters log 64 reports when the caller does not supply
 * them. Only derived values leave this function; a failed read yields none.
 *
 * @async
 * @returns {Promise<Object>} keyGenerations, sendsWithThisKey, keyAgeBucket, storedExtensionVersion.
 */
const readStoredConflictDiagnostics = async () => {
  try {
    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeyGeneratedAt', 'signingKeySends', 'extensionVersion']);
    const generatedAt = stored?.signingKeyGeneratedAt;

    return {
      keyGenerations: stored?.signingKeyGenerations,
      sendsWithThisKey: stored?.signingKeySends,
      keyAgeBucket: Number.isFinite(generatedAt) ? ageBucket(Date.now() - generatedAt) : 'unknown',
      storedExtensionVersion: stored?.extensionVersion
    };
  } catch (err) {
    return {};
  }
};

/**
 * Decides whether log 64 still has to be reported for the current extensionID.
 * An install without an extensionID cannot be deduplicated and always reports.
 * A failed read reports too: a rare duplicate 64 costs less than losing the
 * only one, and the conflict flag already stops the common repeats.
 *
 * @async
 * @returns {Promise<{report: boolean, extensionID: string|null}>} extensionID is the
 *   identity to record once the log went out; null when there is nothing to record.
 */
const readConflictLogTarget = async () => {
  try {
    const stored = await loadFromLocalStorage(['extensionID', SIGNING_CONFLICT_LOGGED_FOR_KEY]);
    const extensionID = typeof stored?.extensionID === 'string' && stored.extensionID !== '' ? stored.extensionID : null;

    return {
      report: extensionID === null || stored[SIGNING_CONFLICT_LOGGED_FOR_KEY] !== extensionID,
      extensionID
    };
  } catch (err) {
    return { report: true, extensionID: null };
  }
};

/**
 * Marks the signing-key conflict state (backend already holds a different
 * key): sets the flag once, logs 64 at most once per extensionID and notifies
 * the user to re-pair. Requests remain unsigned from now on — signing with the
 * wrong key would 401 even during the migration window.
 *
 * The signing-state reads are strict: when either fails, nothing is written,
 * nothing is logged and the transition waits for the next conflicting response.
 *
 * @async
 * @param {*} err - The backend error that revealed the conflict. Only typed fields reach the log.
 * @param {Object} [diagnostics={}] - Key-free context of the failing request (see conflictLogInfo).
 *   A defined field wins over the value read from storage.local.
 * @returns {Promise<void>}
 */
const markSigningConflict = async (err, diagnostics = {}) => {
  try {
    const state = await readSigningState();

    if (state.conflict) {
      return;
    }

    await patchSigningState({ conflict: true, active: false });

    const { report, extensionID } = await readConflictLogTarget();

    if (report) {
      try {
        const { default: storeLog } = await import(/* webpackMode: "eager" */ '@partials/storeLog.js');
        const supplied = Object.entries(diagnostics && typeof diagnostics === 'object' ? diagnostics : {})
          .filter(([, value]) => value !== undefined);
        const info = conflictLogInfo(err, { ...(await readStoredConflictDiagnostics()), ...Object.fromEntries(supplied) });

        await storeLog('warning', 64, info, 'signingState - markSigningConflict');

        if (extensionID !== null) {
          await saveToLocalStorage({ [SIGNING_CONFLICT_LOGGED_FOR_KEY]: extensionID });
        }
      } catch (logErr) {
        safeConsole.error('signingState - markSigningConflict log', logErr);
      }
    }

    const flagged = await loadFromLocalStorage(SIGNING_CONFLICT_REPORTED_FLAG);

    if (flagged?.[SIGNING_CONFLICT_REPORTED_FLAG]) {
      return;
    }

    // Delivered like the reminder (native push, or the active tab's content
    // script) and counted as this version's reminder; the one-shot flag is set
    // either way — the conflict is permanent until the Reset, and the reminder
    // covers a notice that found no page.
    await deliverSigningRepairNotice(config.Texts.Error.SigningKeyConflict);
    await saveToLocalStorage({ [SIGNING_CONFLICT_REPORTED_FLAG]: true });
  } catch (outerErr) {
    safeConsole.error('signingState - markSigningConflict', outerErr);
  }
};

/**
 * Feeds an API response status into the 401 classifier. Only 401 and success
 * are meaningful: 401s increment a consecutive counter that flips
 * registrationRequired at the threshold; any success resets the counter (and
 * the derived registrationRequired state — the backend accepting requests
 * again means no re-registration is needed). Other statuses (including 500 —
 * a deleted record or backend fault is retryable, not a re-registration
 * signal) are ignored.
 *
 * Never throws — called fire-and-forget from the SDK response path. The state
 * reads are strict: a failed read skips the transition instead of writing
 * defaults back (a dropped 401 count, never a lost activation).
 *
 * @async
 * @param {number} status - HTTP response status.
 * @param {Object} [context={}]
 * @param {?boolean} [context.signed=null] - Whether the request carried a signature
 *   (null when the caller does not know): drives the `challenged` transition and
 *   the activation on a verified success.
 * @returns {Promise<void>}
 */
const noteSigningAuthResult = async (status, { signed = null } = {}) => {
  try {
    if (typeof status !== 'number') {
      return;
    }

    if (status === 401) {
      const state = await readSigningState();
      const auth401Count = (state.auth401Count || 0) + 1;
      const patch = { auth401Count };

      if (auth401Count >= AUTH_401_THRESHOLD && !state.registrationRequired) {
        patch.registrationRequired = true;
      }

      // An unsigned request was rejected: the backend verifies this row now.
      // An inactive install signs with the key it holds from here on.
      if (signed === false && !state.active && !state.conflict && !state.challenged) {
        patch.challenged = true;
      }

      await patchSigningState(patch);

      if (patch.registrationRequired) {
        await reportSigningRequired();
      }

      return;
    }

    if (status < 400) {
      const state = await readSigningState();

      // The backend verified a signature by the held key, so the key is the
      // registered one. Only after a challenge: before one, a keyless row lets
      // a signed request through unverified.
      if (signed === true && state.challenged && !state.active && !state.conflict) {
        await activateSigning();
        await removeFromLocalStorage(SIGNING_REQUIRED_REPORTED_FLAG);
        return;
      }

      if (state.auth401Count || state.registrationRequired) {
        await patchSigningState({ auth401Count: 0, registrationRequired: false });
        await removeFromLocalStorage(SIGNING_REQUIRED_REPORTED_FLAG);
      }
    }
  } catch (err) {
    safeConsole.error('signingState - noteSigningAuthResult', err);
  }
};

export {
  getSigningState,
  readSigningState,
  patchSigningState,
  activateSigning,
  noteSigningAuthResult,
  markSigningConflict,
  conflictLogInfo,
  ageBucket,
  defaultSigningState,
  SIGNING_STORAGE_KEY,
  AUTH_401_THRESHOLD,
  SIGNING_REQUIRED_REPORTED_FLAG,
  SIGNING_CONFLICT_REPORTED_FLAG,
  SIGNING_CONFLICT_LOGGED_FOR_KEY
};
