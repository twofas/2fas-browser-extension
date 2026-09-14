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

/* global navigator */
import browser from 'webextension-polyfill';
import config from '@/config.js';
import { loadFromLocalStorage, removeFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import SDK from '@sdk/index.js';
import storeLog from '@partials/storeLog.js';
import TwoFasNotification from '@notification/index.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import { INSTALL_PAGE_REASON_RECOVERED, RECOVERED_PAGE_PENDING_KEY } from '@partials/installPageReasons.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import ensureUsableSigningKeyMaterial from '@background/functions/signing/ensureUsableSigningKeyMaterial.js';
import { activateSigning, markSigningConflict } from '@background/functions/signing/signingState.js';
import {
  REGISTRATION_STORAGE_KEY,
  REGISTRATION_ALARM_NAME,
  REGISTRATION_TIMEOUT_MS,
  BASE_DELAY_MS,
  classifyError,
  isRetryable,
  isSigningKeyConflictError,
  computeBackoffMs,
  shouldEscalate
} from './registrationRetryPolicy.js';

// In-flight guard: collapses concurrent triggers (alarm / 'online' / onStartup /
// inline enqueue) into a single execution so the non-atomic read-modify-write of
// the storage record never races against itself.
let inFlight = null;

/**
 * Loads the pending-registration record, treating a null/absent value as "nothing pending".
 * @returns {Promise<Object|null>}
 */
const loadRecord = async () => {
  try {
    const storage = await loadFromLocalStorage(REGISTRATION_STORAGE_KEY);
    return storage?.[REGISTRATION_STORAGE_KEY] || null;
  } catch (err) {
    console.error('flushBrowserRegistration - loadRecord', err);
    return null;
  }
};

/**
 * Persists the (updated) pending-registration record.
 * @param {Object} record
 * @returns {Promise<void>}
 */
const persistRecord = record => saveToLocalStorage({ [REGISTRATION_STORAGE_KEY]: record });

/**
 * Atomically clears the pending record (single storage write) while optionally
 * committing related values (e.g. the freshly obtained extensionID, or the
 * browserInfo/extensionVersion that the successful update represents). Done in one
 * set() so a service-worker suspension cannot leave the flag and the committed
 * state out of sync.
 * @param {Object} [extra] - Additional keys to write in the same operation.
 * @returns {Promise<void>}
 */
const clearRecord = (extra = {}) => saveToLocalStorage({ ...extra, [REGISTRATION_STORAGE_KEY]: null });

/**
 * Schedules an alarm (same fixed name → replaces any pending one, so no leak) that
 * wakes a possibly-terminated service worker to retry. No-op where alarms are unavailable.
 * @param {number} whenMs - Epoch time (ms) at which to fire.
 * @returns {Promise<void>}
 */
const scheduleAlarm = async whenMs => {
  try {
    if (browser?.alarms?.create) {
      await browser.alarms.create(REGISTRATION_ALARM_NAME, { when: whenMs });
    }
  } catch (err) {
    console.error('flushBrowserRegistration - scheduleAlarm', err);
  }
};

/**
 * Clears the retry alarm. No-op where alarms are unavailable.
 * @returns {Promise<void>}
 */
const clearAlarm = async () => {
  try {
    if (browser?.alarms?.clear) {
      await browser.alarms.clear(REGISTRATION_ALARM_NAME);
    }
  } catch (err) {
    console.error('flushBrowserRegistration - clearAlarm', err);
  }
};

/**
 * Maps a record op to its escalation logID (27 = update/PUT, 28 = create/POST) so
 * existing dashboards keep tracking genuinely-stuck registrations, now WITHOUT the
 * transient-offline noise.
 * @param {string} op
 * @returns {number}
 */
const logIDForOp = op => (op === 'create' ? 28 : 27);

/**
 * Builds a rich, backend-aware diagnostic payload for a stuck/failed registration so the
 * server log captures as much as possible: the backend HTTP error (status / statusText /
 * response body) when the server actually answered, the connectivity state (to tell an
 * offline device apart from a reachable-but-erroring backend), the operation, and how many
 * times / how long it has been failing.
 *
 * @param {Object} record
 * @param {Object|null} err - Normalized SDK error (Response-shaped {status,statusText,content}
 *                            for HTTP errors, or network-shaped {name,message,stack} otherwise).
 * @param {number} now
 * @param {number} attempts
 * @returns {Object}
 */
const registrationErrorInfo = (record, err, now, attempts) => ({
  message: err?.message || `Browser-extension ${record.op} registration failed`,
  name: err?.name || 'RegistrationError',
  op: record.op,
  attempts,
  pendingForMs: now - record.firstAttemptAt,
  online: (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : null,
  backendStatus: err?.status ?? null,
  backendStatusText: err?.statusText ?? null,
  backendContent: err?.content ?? null,
  stack: err?.stack || null,
  cause: err?.cause ? String(err.cause) : null
});

/**
 * Sends the registration PUT. Reads the latest extensionID and name from storage so
 * a user rename (extNameUpdate) made while a record is pending is never clobbered.
 * Resolves on success after atomically committing browserInfo/version + clearing the record.
 * @param {Object} record
 * @returns {Promise<void>}
 */
const sendUpdate = async record => {
  const storage = await loadFromLocalStorage(['extensionID', 'browserInfo', 'signing']);
  const extID = storage?.extensionID;

  if (!extID || typeof extID !== 'string') {
    // Not registered yet — a 'create' record (if any) handles registration.
    await clearRecord();
    await clearAlarm();
    return;
  }

  const payload = {
    name: storage?.browserInfo?.name || record.payload?.name,
    browser_name: record.payload?.browser_name || storage?.browserInfo?.browser_name,
    browser_version: record.payload?.browser_version || storage?.browserInfo?.browser_version
  };
  const committedBrowserInfo = { ...payload };

  // v1.9.0 migration: piggyback the first public-signing-key registration on
  // this PUT (legacy-allowed during the backend's migration window). Skipped
  // once active (key already registered) or in conflict (server holds a
  // different key — sending ours again would 400 forever). The private half
  // is verified usable first; regenerating is safe while unregistered. A
  // transient IndexedDB error throws → normal retry/backoff.
  const signing = storage?.signing;
  let includesSigningKey = false;

  if (!signing?.active && !signing?.conflict) {
    const { signingPublicKey } = await ensureUsableSigningKeyMaterial();
    payload.public_signing_key = signingPublicKey;
    includesSigningKey = true;
  }

  await new SDK().updateBrowserExtension(extID, payload, { timeoutMs: REGISTRATION_TIMEOUT_MS });

  await clearRecord({ browserInfo: committedBrowserInfo, extensionVersion: config.ExtensionVersion });

  if (includesSigningKey) {
    // The server accepted (first key set, or same-key no-op) — signing is
    // active from now on. Written through the serialized signing-state queue
    // so a concurrent SDK response tap can never overwrite the activation
    // with a stale snapshot. If the worker dies between clearRecord and this
    // write, ensureSigningKeyRegistration re-enqueues on the next startup and
    // the same-key PUT is a server-side no-op — self-healing.
    await activateSigning();
  }

  await clearAlarm();
};

/**
 * Sends the registration POST (re-)registration. Reads the public key from storage;
 * on success atomically stores the extensionID + clears the record, then best-effort
 * sets the uninstall URL.
 * @param {Object} record
 * @returns {Promise<void>}
 */
const sendCreate = async record => {
  const storage = await loadFromLocalStorage(['keys', 'browserInfo', 'extensionID']);

  if (storage?.extensionID && !record.reregister) {
    // Already registered (race) — nothing to create. A 'reregister' record is the
    // exception: the server returned 404 for the stored extensionID, so that ID is
    // dead and a fresh registration must overwrite it.
    await clearRecord();
    await clearAlarm();
    return;
  }

  const publicKey = storage?.keys?.publicKey;

  if (!publicKey) {
    // Cannot register without keys — generateDefaultStorage owns key creation.
    await clearRecord();
    await clearAlarm();
    return;
  }

  // Never commit a registration whose private half is gone: the resulting state
  // is permanently broken (missing-private-key, log 57) instead of a regenerable
  // incomplete one. A transient IndexedDB failure throws and retries via the
  // normal backoff; a genuinely absent key drops the record so the integrity
  // check can regenerate or surface the re-pair prompt.
  if (!(await getOrMigratePrivateKey(storage))) {
    await clearRecord();
    await clearAlarm();
    return;
  }

  const body = {
    // A reregister record was converted from an update and may carry a stale
    // payload name — prefer the live storage name so a user rename made while
    // the record was pending is never clobbered (mirrors sendUpdate).
    name: record.reregister
      ? (storage?.browserInfo?.name || record.payload?.name)
      : (record.payload?.name || storage?.browserInfo?.name),
    browser_name: record.payload?.browser_name || storage?.browserInfo?.browser_name,
    browser_version: record.payload?.browser_version || storage?.browserInfo?.browser_version,
    public_key: publicKey
  };

  // v1.9.0: a fresh registration always carries a usable signing key — the
  // backend stores it at create time and requires signed requests from then
  // on. Regeneration here is safe: the record being created has no key
  // server-side yet (new registration, or a dead-ID reregister). A transient
  // IndexedDB error throws → normal retry/backoff.
  const { signingPublicKey } = await ensureUsableSigningKeyMaterial();
  body.public_signing_key = signingPublicKey;

  const data = await new SDK().createExtensionInstance(body, { timeoutMs: REGISTRATION_TIMEOUT_MS });

  if (!data?.id) {
    // Unexpected success shape — treat as transient and retry.
    throw new Error('createExtensionInstance: missing id in response');
  }

  await clearRecord({ extensionID: data.id });
  // Serialized signing-state write (see sendUpdate); a death between the two
  // writes self-heals via ensureSigningKeyRegistration + same-key no-op PUT.
  await activateSigning();
  await clearAlarm();

  if (process.env.EXT_PLATFORM !== 'Safari') {
    try {
      await browser.runtime.setUninstallURL(`https://2fas.com/auth/byebye/${data.id}/`);
    } catch (err) {
      console.error('flushBrowserRegistration - setUninstallURL', err);
    }
  }

  await openRecoveredPageIfPending();
};

/**
 * Finishes an OFFLINE self-heal. The heal regenerated the identity but could not
 * register it, so it left a marker instead of opening the pairing page (the page
 * needs an extensionID). Now that the registration landed — from an alarm, the
 * 'online' event or a startup flush, with no user in front of the browser — open
 * that page with the explanation, in the background, and tell the user once.
 * Without this the next toolbar click landed on a bare pairing screen.
 *
 * @async
 * @returns {Promise<void>}
 */
const openRecoveredPageIfPending = async () => {
  const pending = await loadFromLocalStorage(RECOVERED_PAGE_PENDING_KEY).catch(() => null);

  if (!pending?.[RECOVERED_PAGE_PENDING_KEY]) {
    return;
  }

  // Cleared first: a failure below must not reopen the page on every later flush.
  await removeFromLocalStorage(RECOVERED_PAGE_PENDING_KEY).catch(() => {});

  try {
    await openInstallPage(INSTALL_PAGE_REASON_RECOVERED, { focusWindow: false });
  } catch (err) {
    await storeLog('warning', 70, err, 'flushBrowserRegistration - openInstallPage').catch(() => {});
  }

  // Best effort: reaches the user only as a native notification (no tab to render
  // a front-end one in), which is the default everywhere but Safari.
  await TwoFasNotification.show(config.Texts.Error.StorageRecovered).catch(() => {});
};

/**
 * Handles a failed attempt: re-registers on 404, gives up (logging once) on a
 * deterministic 4xx, or backs off + reschedules on a transient failure — escalating
 * to a single log only once the registration is genuinely stuck (a proxy 407 backs
 * off but never escalates).
 * @param {Object} record
 * @param {Object} err - Normalized SDK error.
 * @param {number} now
 * @returns {Promise<void>}
 */
const handleFailure = async (record, err, now) => {
  const classification = classifyError(err);

  if (record.op === 'update' && isSigningKeyConflictError(err)) {
    // The server already holds a DIFFERENT public signing key for this
    // extensionID and never replaces keys — mark the conflict (log 64 +
    // one-shot re-pair notification) and retry the PUT WITHOUT the key so the
    // browser-info update itself still lands. Attempts reset: the keyless
    // retry is a fresh episode, not a continuation of a doomed one.
    await markSigningConflict(err);

    const next = now + computeBackoffMs(1);
    await persistRecord({ ...record, attempts: 0, nextAttemptAt: next, reported: false });
    await scheduleAlarm(next);
    return;
  }

  if (record.op === 'update' && classification === 'notFound') {
    // Server no longer knows this extension — switch to re-registration. The
    // reregister flag lets sendCreate proceed despite the (dead) stored
    // extensionID; the new registration overwrites it. Pairings tied to the old
    // ID are already gone server-side — the user re-pairs against the new one.
    const next = now + computeBackoffMs(1);
    await persistRecord({
      ...record,
      op: 'create',
      reregister: true,
      attempts: 0,
      firstAttemptAt: now,
      nextAttemptAt: next,
      reported: false
    });
    await scheduleAlarm(next);
    return;
  }

  if (!isRetryable(classification)) {
    // Deterministic client error — retrying is futile. Surface once and stop.
    await storeLog(
      'error',
      logIDForOp(record.op),
      registrationErrorInfo(record, err, now, record.attempts),
      `flushBrowserRegistration - ${record.op} - non-retryable`
    );
    await clearRecord();
    await clearAlarm();
    return;
  }

  const attempts = record.attempts + 1;
  const next = now + computeBackoffMs(attempts);
  const updated = { ...record, attempts, nextAttemptAt: next };

  // A proxy 407 is the user's environment (#1163): it backs off like any
  // transient failure but never escalates — storeLog would drop the entry
  // anyway, and consuming `reported` here would silence a later, real backend
  // outage on the same record.
  if (err?.status !== 407 && shouldEscalate(updated, now)) {
    await storeLog(
      'error',
      logIDForOp(record.op),
      registrationErrorInfo(record, err, now, attempts),
      `flushBrowserRegistration - ${record.op} - stuck`
    );
    updated.reported = true;
  }

  await persistRecord(updated);
  await scheduleAlarm(next);
};

/**
 * One flush pass: attempts to deliver the pending registration, applying the
 * offline gate and the retry/backoff policy. Every trigger (alarm / 'online' /
 * onStartup / inline enqueue) attempts immediately — the alarm is already
 * scheduled at the record's nextAttemptAt, so there is no separate schedule gate.
 * @returns {Promise<void>}
 */
const doFlush = async () => {
  const record = await loadRecord();

  if (!record) {
    await clearAlarm();
    return;
  }

  const now = Date.now();

  if (navigator.onLine === false) {
    // Don't burn an attempt while offline; recover via the 'online' event / alarm /
    // onStartup. Still surface a long-pending registration exactly once.
    if (shouldEscalate(record, now)) {
      await storeLog(
        'error',
        logIDForOp(record.op),
        registrationErrorInfo(
          record,
          { name: 'OfflineStuck', message: 'Browser-extension registration pending while offline' },
          now,
          record.attempts
        ),
        `flushBrowserRegistration - ${record.op} - offline-stuck`
      );
      await persistRecord({ ...record, reported: true });
    }

    await scheduleAlarm(now + BASE_DELAY_MS);
    return;
  }

  try {
    if (record.op === 'create') {
      await sendCreate(record);
    } else {
      await sendUpdate(record);
    }
  } catch (err) {
    await handleFailure(record, err, Date.now());
  }
};

/**
 * Delivers the pending browser-extension registration to the 2FAS API, retrying
 * durably across transient network failures, offline cold-starts and MV3
 * service-worker termination. Safe to call from many triggers — concurrent calls
 * share a single in-flight execution and it never rejects.
 *
 * @returns {Promise<void>}
 */
const flushBrowserRegistration = () => {
  if (inFlight) {
    return inFlight;
  }

  inFlight = doFlush()
    .catch(err => console.error('flushBrowserRegistration', err))
    .finally(() => { inFlight = null; });

  return inFlight;
};

export default flushBrowserRegistration;
