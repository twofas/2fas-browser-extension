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
import describeBackendError from '@partials/describeBackendError.js';
import safeConsole from '@partials/safeConsole.js';
import TwoFasNotification from '@notification/index.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import { INSTALL_PAGE_REASON_RECOVERED, RECOVERED_PAGE_PENDING_KEY } from '@partials/installPageReasons.js';
import { getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import ensureUsableSigningKeyMaterial, { SIGNING_ACTIVE } from '@background/functions/signing/ensureUsableSigningKeyMaterial.js';
import { activateSigning, ageBucket, markSigningConflict } from '@background/functions/signing/signingState.js';
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
    safeConsole.error('flushBrowserRegistration - loadRecord', err);
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
 * Reads the identity a registration pass works for: the extensionID and the RSA
 * public key. A reset or a self-heal replaces at least one of them. Kept in
 * memory only, never logged.
 * @returns {Promise<{extensionID: *, publicKey: *}>}
 * @throws {Error} When storage.local cannot be read.
 */
const readIdentity = async () => {
  const storage = await loadFromLocalStorage(['extensionID', 'keys']);

  return { extensionID: storage?.extensionID, publicKey: storage?.keys?.publicKey };
};

/**
 * Whether a reset or self-heal replaced the identity since `before` was read.
 * Checked before a request, after its rejection and after its success, so the
 * outcome of the old identity's request never lands on the new one: no commit,
 * no record change, no conflict mark. Fails open: a failed read counts as
 * unchanged, so a flaky read after a 2xx can never drop a committed POST and
 * send it again (a second extension row).
 * @param {{extensionID: *, publicKey: *}} before
 * @returns {Promise<boolean>}
 */
const identityChanged = async before => {
  try {
    const current = await readIdentity();

    return current.extensionID !== before.extensionID || current.publicKey !== before.publicKey;
  } catch (err) {
    return false;
  }
};

// What sendUpdate / sendCreate return when a guard found the identity replaced:
// the pass ended without touching the new identity's state.
const IDENTITY_CHANGED = 'identityChanged';

/**
 * Counts one keyed request (a PUT carrying public_signing_key, or a create POST)
 * about to go out with the current signing key, and returns how many went out
 * with that key before it: log 64's `sendsWithThisKey`, 0 for its first send.
 * Best effort and outside the key-material lock: a storage failure never blocks
 * or fails the request. The write is skipped when the identity changed since
 * `before`, so the old identity never bumps a reset's fresh counter.
 *
 * @async
 * @param {{extensionID: *, publicKey: *}} before
 * @returns {Promise<number|null|undefined>} The count before this send; null when the
 *   stored counter is absent or malformed; undefined when storage.local could not be read.
 */
const countKeyedSend = async before => {
  let stored;

  try {
    stored = await loadFromLocalStorage(['extensionID', 'keys', 'signingKeySends']);
  } catch (err) {
    return undefined;
  }

  const sends = stored?.signingKeySends;
  const sentBefore = Number.isSafeInteger(sends) && sends >= 0 ? sends : null;

  if (stored?.extensionID === before.extensionID && stored?.keys?.publicKey === before.publicKey) {
    await saveToLocalStorage({ signingKeySends: (sentBefore ?? 0) + 1 }).catch(() => {});
  }

  return sentBefore;
};

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
    safeConsole.error('flushBrowserRegistration - scheduleAlarm', err);
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
    safeConsole.error('flushBrowserRegistration - clearAlarm', err);
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
 * Builds a backend-aware diagnostic payload for a stuck/failed registration: the backend
 * HTTP status / statusText when the server actually answered, plus a typed description of
 * its response (describeBackendError — never the body itself, which can echo the public
 * keys the request sent), the connectivity state (to tell an offline device apart from a
 * reachable-but-erroring backend), the operation, and how many times / how long it has
 * been failing. backendStatus / backendStatusText stay: storeLog's proxy-407 filter reads them.
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
  backend: describeBackendError(err),
  stack: err?.stack || null,
  cause: err?.cause ? String(err.cause) : null
});

/**
 * Sends the registration PUT. Reads the latest extensionID and name from storage so
 * a user rename (extNameUpdate) made while a record is pending is never clobbered.
 * On success commits browserInfo/version and clears the record in one write, which
 * also activates signing when the PUT carried the key. Ends silently, committing
 * nothing, when a reset or self-heal replaced the identity meanwhile. A signing
 * key that could not be stored is never sent, and neither is any key for a
 * record marked `keyless` (a retry after a conflict).
 * @param {Object} record
 * @param {Object} sent - Receives `keyedSendIndex` when the PUT carries the key (for handleFailure).
 * @returns {Promise<string|undefined>} IDENTITY_CHANGED when a guard ended the pass.
 */
const sendUpdate = async (record, sent) => {
  const storage = await loadFromLocalStorage(['extensionID', 'browserInfo', 'signing', 'keys']);
  const extID = storage?.extensionID;

  if (!extID || typeof extID !== 'string') {
    // Not registered yet — a 'create' record (if any) handles registration.
    await clearRecord();
    await clearAlarm();
    return;
  }

  const before = { extensionID: extID, publicKey: storage?.keys?.publicKey };
  const payload = {
    name: storage?.browserInfo?.name || record.payload?.name,
    browser_name: record.payload?.browser_name || storage?.browserInfo?.browser_name,
    browser_version: record.payload?.browser_version || storage?.browserInfo?.browser_version
  };
  const committed = { browserInfo: { ...payload }, extensionVersion: config.ExtensionVersion };

  // v1.9.0 migration: piggyback the first public-signing-key registration on
  // this PUT (legacy-allowed during the backend's migration window). Skipped
  // once active (key already registered), in conflict (server holds a
  // different key — sending ours again would 400 forever), or for a keyless
  // retry (this record's key already drew that conflict, whether or not the
  // conflict flag could be stored). The key is pair-verified first; a held
  // private key nothing pairs with is kept, not replaced (the backend never
  // replaces a registered key), and then there is no key to send. A transient
  // IndexedDB error throws → normal retry/backoff.
  const signing = storage?.signing;
  let includesSigningKey = false;

  if (record.keyless !== true && !signing?.active && !signing?.conflict) {
    try {
      const { signingPublicKey, persisted } = await ensureUsableSigningKeyMaterial();

      // A key that did not land in storage.local is never registered: either a
      // reset replaced the identity (the guard below ends the pass), or there is
      // no RSA identity to keep it next to (the PUT goes out keyless). No public
      // key at all = a held private key nothing pairs with, kept because the
      // backend never replaces a key: nothing to send (the PUT goes out keyless).
      if (signingPublicKey && persisted !== false) {
        payload.public_signing_key = signingPublicKey;
        includesSigningKey = true;
      }
    } catch (err) {
      // Signing turned active after the read above and the stored key failed its
      // check: replacing a registered key is refused, and a registered key needs
      // no PUT. The browser-info update still goes out, keyless, in this pass.
      if (err?.code !== SIGNING_ACTIVE) {
        // A reset that replaced the identity during the key read must not reach
        // handleFailure: its retry write would put this record over the new
        // identity's pending create.
        if (await identityChanged(before)) {
          return IDENTITY_CHANGED;
        }

        throw err;
      }
    }
  }

  if (await identityChanged(before)) {
    return IDENTITY_CHANGED;
  }

  if (includesSigningKey) {
    sent.keyedSendIndex = await countKeyedSend(before);
  }

  try {
    await new SDK().updateBrowserExtension(extID, payload, { timeoutMs: REGISTRATION_TIMEOUT_MS });
  } catch (err) {
    if (await identityChanged(before)) {
      return IDENTITY_CHANGED;
    }

    throw err;
  }

  if (await identityChanged(before)) {
    return IDENTITY_CHANGED;
  }

  if (includesSigningKey) {
    // The server accepted the key (first set, or a same-key no-op). The cleared
    // record, the committed browser info and the activation land in ONE set,
    // serialized with every other signing-state write: a worker death or an idle
    // teardown keeps all of them or none, and "none" re-sends the same key.
    await activateSigning({ ...committed, [REGISTRATION_STORAGE_KEY]: null });
  } else {
    await clearRecord(committed);
  }

  await clearAlarm();
};

/**
 * Sends the registration POST (re-)registration. Reads the public key from storage;
 * on success stores the extensionID, clears the record and activates signing in one
 * write, then best-effort sets the uninstall URL. Ends silently, committing nothing,
 * when a reset or self-heal replaced the identity meanwhile.
 * @param {Object} record
 * @param {Object} sent - Receives `keyedSendIndex` (for handleFailure).
 * @returns {Promise<string|undefined>} IDENTITY_CHANGED when a guard ended the pass.
 */
const sendCreate = async (record, sent) => {
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

  const before = { extensionID: storage?.extensionID, publicKey };

  // Never commit a registration whose private half is gone: the resulting state
  // is permanently broken (missing-private-key, log 57) instead of a regenerable
  // incomplete one. A transient IndexedDB failure throws and retries via the
  // normal backoff; a genuinely absent key drops the record so the integrity
  // check can regenerate or surface the re-pair prompt.
  let privateKey;

  try {
    privateKey = await getOrMigratePrivateKey(storage);
  } catch (err) {
    // A reset that replaced the identity meanwhile owns the record now (see sendUpdate).
    if (await identityChanged(before)) {
      return IDENTITY_CHANGED;
    }

    throw err;
  }

  if (!privateKey) {
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
  // server-side yet (new registration, or a dead-ID reregister), so a held
  // key nothing pairs with, or an active one, may be replaced: a reregister
  // follows a 404 for the active extensionID, whose key went with its row. A
  // transient IndexedDB error throws → normal retry/backoff.
  try {
    const { signingPublicKey } = await ensureUsableSigningKeyMaterial({ forNewIdentity: true });

    body.public_signing_key = signingPublicKey;
  } catch (err) {
    if (await identityChanged(before)) {
      return IDENTITY_CHANGED;
    }

    throw err;
  }

  if (await identityChanged(before)) {
    return IDENTITY_CHANGED;
  }

  sent.keyedSendIndex = await countKeyedSend(before);

  let data;

  try {
    data = await new SDK().createExtensionInstance(body, { timeoutMs: REGISTRATION_TIMEOUT_MS });
  } catch (err) {
    if (await identityChanged(before)) {
      return IDENTITY_CHANGED;
    }

    throw err;
  }

  if (await identityChanged(before)) {
    return IDENTITY_CHANGED;
  }

  if (!data?.id) {
    // Unexpected success shape — treat as transient and retry.
    throw new Error('createExtensionInstance: missing id in response');
  }

  // The new row holds the key from its creation: the extensionID, the cleared
  // record and the activation land in one serialized set (see sendUpdate).
  await activateSigning({ extensionID: data.id, [REGISTRATION_STORAGE_KEY]: null });
  await clearAlarm();

  if (process.env.EXT_PLATFORM !== 'Safari') {
    try {
      await browser.runtime.setUninstallURL(`https://2fas.com/auth/byebye/${data.id}/`);
    } catch (err) {
      safeConsole.error('flushBrowserRegistration - setUninstallURL', err);
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
 * Builds log 64's key-free diagnostics for a conflicting request: the failing
 * record's attempts and age, how many sends of the current signing key preceded
 * this one, and the key lineage and last committed version from storage.local.
 * Fields left undefined (the send index when it could not be read, everything
 * stored when storage.local cannot be read) are filled by markSigningConflict.
 *
 * @async
 * @param {Object} record - The failing registration record.
 * @param {number} now
 * @param {Object} sent - What the pass sent (`keyedSendIndex`).
 * @returns {Promise<Object>} Diagnostics for markSigningConflict.
 */
const conflictDiagnostics = async (record, now, sent) => {
  const diagnostics = {
    sendsWithThisKey: sent?.keyedSendIndex,
    recordAttempts: record.attempts,
    recordAgeBucket: ageBucket(now - record.firstAttemptAt)
  };

  try {
    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeyGeneratedAt', 'extensionVersion']);
    const generatedAt = stored?.signingKeyGeneratedAt;

    return {
      ...diagnostics,
      keyGenerations: stored?.signingKeyGenerations ?? null,
      keyAgeBucket: Number.isFinite(generatedAt) ? ageBucket(now - generatedAt) : 'unknown',
      storedExtensionVersion: stored?.extensionVersion ?? null
    };
  } catch (err) {
    return diagnostics;
  }
};

/**
 * Handles a failed attempt: re-registers on 404, gives up (logging once) on a
 * deterministic 4xx, or backs off + reschedules on a transient failure — escalating
 * to a single log only once the registration is genuinely stuck (a proxy 407 backs
 * off but never escalates). A 401 is deterministic either way: clock skew is
 * re-signed inside the SDK, so a signed 401 that gets here means the row
 * verifies against a key this install does not hold — one the backend never
 * replaces — and a retry could only draw another rejection.
 * @param {Object} record
 * @param {Object} err - Normalized SDK error.
 * @param {number} now
 * @param {Object} [sent={}] - What the failed pass sent (`keyedSendIndex`, for log 64).
 * @returns {Promise<void>}
 */
const handleFailure = async (record, err, now, sent = {}) => {
  const classification = classifyError(err);

  if (record.op === 'update' && isSigningKeyConflictError(err)) {
    // The server already holds a DIFFERENT public signing key for this
    // extensionID and never replaces keys — mark the conflict (log 64 +
    // one-shot re-pair notification) and retry the PUT WITHOUT the key so the
    // browser-info update itself still lands. Attempts reset: the keyless
    // retry is a fresh episode, not a continuation of a doomed one. Log 64's
    // key-free cause tells a second copy of the identity apart from a local
    // regeneration.
    //
    // `keyless` makes the retry keyless by itself: markSigningConflict writes
    // nothing when its strict signing-state read fails, and the retry would
    // otherwise re-send the same key (another 400 echoing it) every backoff.
    // The flag lasts as long as this record, including every update that
    // enqueueBrowserRegistration merges into it while it is pending (the
    // conflict is permanent for this extensionID). Only after the keyless PUT
    // commits, converts to a create on 404, or is dropped does a later episode
    // (a browser or extension update, ensureSigningKeyRegistration on browser
    // start) start a fresh, keyed record. So an install whose conflict never got
    // stored sends at most one keyed PUT per such episode. The cost: the keyless
    // retry commits without log 64 and the re-pair notification, which wait for
    // that next episode's conflict.
    await markSigningConflict(err, await conflictDiagnostics(record, now, sent));

    const next = now + computeBackoffMs(1);
    await persistRecord({ ...record, attempts: 0, nextAttemptAt: next, reported: false, keyless: true });
    await scheduleAlarm(next);
    return;
  }

  if (record.op === 'update' && classification === 'notFound') {
    // Server no longer knows this extension — switch to re-registration. The
    // reregister flag lets sendCreate proceed despite the (dead) stored
    // extensionID; the new registration overwrites it. Pairings tied to the old
    // ID are already gone server-side — the user re-pairs against the new one.
    // A create POST always carries the signing key, so a keyless flag from a
    // conflict retry is dropped with the update op.
    const next = now + computeBackoffMs(1);
    const converted = {
      ...record,
      op: 'create',
      reregister: true,
      attempts: 0,
      firstAttemptAt: now,
      nextAttemptAt: next,
      reported: false
    };

    delete converted.keyless;

    await persistRecord(converted);
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

  // What this pass sent, for handleFailure: the send index of a keyed request.
  const sent = {};
  let outcome;

  try {
    if (record.op === 'create') {
      outcome = await sendCreate(record, sent);
    } else {
      outcome = await sendUpdate(record, sent);
    }
  } catch (err) {
    await handleFailure(record, err, Date.now(), sent);
  }

  if (outcome === IDENTITY_CHANGED) {
    // The pass left the new identity's state alone, including a create its
    // reset queued meanwhile: that enqueue's flush call joined this pass, so
    // nothing else would attempt it before the next browser start. A pass that
    // finds no record clears the alarm again.
    await scheduleAlarm(Date.now() + BASE_DELAY_MS);
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
    .catch(err => safeConsole.error('flushBrowserRegistration', err))
    .finally(() => { inFlight = null; });

  return inFlight;
};

export default flushBrowserRegistration;
