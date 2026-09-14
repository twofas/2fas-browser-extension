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

/**
 * Request-signing lifecycle state, kept in storage.local under 'signing':
 *
 *  - active               : the public signing key is confirmed registered with the
 *                           backend — every protected request is signed from now on.
 *  - conflict             : the backend holds a DIFFERENT public signing key for this
 *                           extensionID (key replacement is not supported server-side).
 *                           Requests stay unsigned; the user must reinstall/re-pair.
 *  - registrationRequired : the backend rejects this extension's requests (migration
 *                           window closed without a registered key, or persistent 401
 *                           while signing) — the user must reinstall/re-pair.
 *  - auth401Count         : consecutive-401 counter feeding registrationRequired.
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

/** @returns {Object} A fresh default signing-state object. */
const defaultSigningState = () => ({
  active: false,
  conflict: false,
  registrationRequired: false,
  auth401Count: 0
});

/**
 * Loads the signing state, filling in defaults for missing fields (installs
 * migrated before the field existed, partial writes).
 *
 * @async
 * @returns {Promise<Object>}
 */
const getSigningState = async () => {
  try {
    const stored = await loadFromLocalStorage(SIGNING_STORAGE_KEY);

    return { ...defaultSigningState(), ...(stored?.[SIGNING_STORAGE_KEY] || {}) };
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
 * inside the per-context mutation lock, so queued patches never overwrite
 * each other's fields.
 *
 * @async
 * @param {Object} patch - Fields to change.
 * @returns {Promise<Object>} The new state.
 */
const patchSigningState = patch => withSigningLock(async () => {
  const state = { ...(await getSigningState()), ...patch };

  await saveToLocalStorage({ [SIGNING_STORAGE_KEY]: state });

  return state;
});

/**
 * Marks the signing key as confirmed-registered: from now on every protected
 * request is signed. Serialized like every other signing-state mutation.
 *
 * @async
 * @returns {Promise<Object>} The new state.
 */
const activateSigning = () => patchSigningState({
  active: true,
  conflict: false,
  registrationRequired: false,
  auth401Count: 0
});

/**
 * Emits the one-shot "re-registration required" report: log 66 plus a
 * user-facing notification prompting a reinstall/re-pair.
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
      console.error('signingState - reportSigningRequired log', err);
    }

    try {
      const [{ default: TwoFasNotification }, { default: config }] = await Promise.all([
        import(/* webpackMode: "eager" */ '@notification/index.js'),
        import(/* webpackMode: "eager" */ '@/config.js')
      ]);
      // A conflicted install already heard "Re-pairing required" — keep the
      // same wording when the window closing merely confirms that verdict.
      const state = await getSigningState();
      const text = state.conflict ? config.Texts.Error.SigningKeyConflict : config.Texts.Error.SigningRequired;

      await TwoFasNotification.show(text);
    } catch (err) {
      // A failed notification must not leave the flag unset — the state is
      // permanent until re-pair and would otherwise re-notify forever.
    }

    await saveToLocalStorage({ [SIGNING_REQUIRED_REPORTED_FLAG]: true });
  } catch (err) {
    console.error('signingState - reportSigningRequired', err);
  }
};

/**
 * Marks the signing-key conflict state (backend already holds a different
 * key): sets the flag once, logs 64 and notifies the user to re-pair.
 * Requests remain unsigned from now on — signing with the wrong key would 401
 * even during the migration window.
 *
 * @async
 * @param {*} err - The backend error that revealed the conflict (for the log).
 * @returns {Promise<void>}
 */
const markSigningConflict = async err => {
  try {
    const state = await getSigningState();

    if (state.conflict) {
      return;
    }

    await patchSigningState({ conflict: true, active: false });

    try {
      const { default: storeLog } = await import(/* webpackMode: "eager" */ '@partials/storeLog.js');
      await storeLog('warning', 64, err, 'signingState - markSigningConflict');
    } catch (logErr) {
      console.error('signingState - markSigningConflict log', logErr);
    }

    const flagged = await loadFromLocalStorage(SIGNING_CONFLICT_REPORTED_FLAG);

    if (flagged?.[SIGNING_CONFLICT_REPORTED_FLAG]) {
      return;
    }

    try {
      const [{ default: TwoFasNotification }, { default: config }] = await Promise.all([
        import(/* webpackMode: "eager" */ '@notification/index.js'),
        import(/* webpackMode: "eager" */ '@/config.js')
      ]);
      await TwoFasNotification.show(config.Texts.Error.SigningKeyConflict);
    } catch (notifyErr) {
      // Flag is still set below — never re-notify forever on notification failure.
    }

    await saveToLocalStorage({ [SIGNING_CONFLICT_REPORTED_FLAG]: true });
  } catch (outerErr) {
    console.error('signingState - markSigningConflict', outerErr);
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
 * Never throws — called fire-and-forget from the SDK response path.
 *
 * @async
 * @param {number} status - HTTP response status.
 * @returns {Promise<void>}
 */
const noteSigningAuthResult = async status => {
  try {
    if (typeof status !== 'number') {
      return;
    }

    if (status === 401) {
      const state = await getSigningState();
      const auth401Count = (state.auth401Count || 0) + 1;
      const patch = { auth401Count };

      if (auth401Count >= AUTH_401_THRESHOLD && !state.registrationRequired) {
        patch.registrationRequired = true;
      }

      await patchSigningState(patch);

      if (patch.registrationRequired) {
        await reportSigningRequired();
      }

      return;
    }

    if (status < 400) {
      const state = await getSigningState();

      if (state.auth401Count || state.registrationRequired) {
        await patchSigningState({ auth401Count: 0, registrationRequired: false });
        await removeFromLocalStorage(SIGNING_REQUIRED_REPORTED_FLAG);
      }
    }
  } catch (err) {
    console.error('signingState - noteSigningAuthResult', err);
  }
};

export {
  getSigningState,
  patchSigningState,
  activateSigning,
  noteSigningAuthResult,
  markSigningConflict,
  defaultSigningState,
  SIGNING_STORAGE_KEY,
  AUTH_401_THRESHOLD,
  SIGNING_REQUIRED_REPORTED_FLAG,
  SIGNING_CONFLICT_REPORTED_FLAG
};
