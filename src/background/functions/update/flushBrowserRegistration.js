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
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import SDK from '@sdk/index.js';
import storeLog from '@partials/storeLog.js';
import {
  REGISTRATION_STORAGE_KEY,
  REGISTRATION_ALARM_NAME,
  REGISTRATION_TIMEOUT_MS,
  BASE_DELAY_MS,
  classifyError,
  isRetryable,
  computeBackoffMs,
  shouldEscalate
} from './registrationRetryPolicy.js';

// In-flight guard: collapses concurrent triggers (alarm / 'online' / onStartup /
// keepalive tick / inline enqueue) into a single execution so the non-atomic
// read-modify-write of the storage record never races against itself.
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
  const storage = await loadFromLocalStorage(['extensionID', 'browserInfo']);
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

  await new SDK().updateBrowserExtension(extID, payload, { timeoutMs: REGISTRATION_TIMEOUT_MS });

  await clearRecord({ browserInfo: payload, extensionVersion: config.ExtensionVersion });
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

  if (storage?.extensionID) {
    // Already registered (race) — nothing to create.
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

  const body = {
    name: record.payload?.name || storage?.browserInfo?.name,
    browser_name: record.payload?.browser_name || storage?.browserInfo?.browser_name,
    browser_version: record.payload?.browser_version || storage?.browserInfo?.browser_version,
    public_key: publicKey
  };

  const data = await new SDK().createExtensionInstance(body, { timeoutMs: REGISTRATION_TIMEOUT_MS });

  if (!data?.id) {
    // Unexpected success shape — treat as transient and retry.
    throw new Error('createExtensionInstance: missing id in response');
  }

  await clearRecord({ extensionID: data.id });
  await clearAlarm();

  if (process.env.EXT_PLATFORM !== 'Safari') {
    try {
      await browser.runtime.setUninstallURL(`https://2fas.com/auth/byebye/${data.id}/`);
    } catch (err) {
      console.error('flushBrowserRegistration - setUninstallURL', err);
    }
  }
};

/**
 * Handles a failed attempt: re-registers on 404, gives up (logging once) on a
 * deterministic 4xx, or backs off + reschedules on a transient failure — escalating
 * to a single log only once the registration is genuinely stuck.
 * @param {Object} record
 * @param {Object} err - Normalized SDK error.
 * @param {number} now
 * @returns {Promise<void>}
 */
const handleFailure = async (record, err, now) => {
  const classification = classifyError(err);

  if (record.op === 'update' && classification === 'notFound') {
    // Server no longer knows this extension — switch to re-registration.
    const next = now + computeBackoffMs(1);
    await persistRecord({
      ...record,
      op: 'create',
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

  if (shouldEscalate(updated, now)) {
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
 * offline gate, the schedule (for periodic ticks) and the retry/backoff policy.
 * @param {boolean} force - When false, respect nextAttemptAt (used by the periodic
 *                          keepalive tick); event/alarm/startup driven calls force now.
 * @returns {Promise<void>}
 */
const doFlush = async force => {
  const record = await loadRecord();

  if (!record) {
    await clearAlarm();
    return;
  }

  const now = Date.now();

  if (!force && now < record.nextAttemptAt) {
    return;
  }

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
 * @param {Object} [options]
 * @param {boolean} [options.force=true] - When false, only attempt if the backoff
 *                                         schedule is due (for the periodic keepalive tick).
 * @returns {Promise<void>}
 */
const flushBrowserRegistration = ({ force = true } = {}) => {
  if (inFlight) {
    return inFlight;
  }

  inFlight = doFlush(force)
    .catch(err => console.error('flushBrowserRegistration', err))
    .finally(() => { inFlight = null; });

  return inFlight;
};

export default flushBrowserRegistration;
