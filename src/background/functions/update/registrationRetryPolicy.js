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

/**
 * Pure, side-effect-free decision logic for the durable browser-extension
 * registration retry mechanism. Kept free of browser APIs (no fetch, storage,
 * alarms or Date.now) so it can be unit-tested in isolation — the orchestrator
 * (flushBrowserRegistration) supplies `now`/`rand` and performs the I/O.
 */

/** Storage key holding the single pending-registration record. */
export const REGISTRATION_STORAGE_KEY = 'pendingBrowserRegistration';

/** Name of the alarm that wakes the (possibly terminated) service worker to retry. */
export const REGISTRATION_ALARM_NAME = 'flushBrowserRegistration';

/** Per-attempt network timeout (ms) — a hung connection must reject deterministically. */
export const REGISTRATION_TIMEOUT_MS = 15000;

/** First backoff step (ms). Aligned with the ~30s minimum granularity of browser alarms. */
export const BASE_DELAY_MS = 30000;

/** Backoff ceiling (ms). */
export const MAX_DELAY_MS = 60 * 60 * 1000; // 1 hour

/** Escalate to a log once the registration has failed this many times. */
export const MAX_ATTEMPTS_BEFORE_ESCALATE = 8;

/** Escalate to a log once a registration has been pending at least this long (ms). */
export const STUCK_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const JITTER_RATIO = 0.2;

/**
 * Classifies a normalized SDK error (see SDK.onError) into a retry category.
 *
 * SDK.onError returns either an HTTP-error object carrying a numeric `status`,
 * or a network/parse error object with `name`/`message` and NO `status`
 * (e.g. { name: 'TypeError', message: 'Failed to fetch' } or an AbortError on timeout).
 *
 * @param {{status?: number}|null|undefined} err - The normalized error.
 * @returns {'network'|'server'|'notFound'|'client'}
 *   - network : connection/DNS/TLS/abort failure (transient, retry)
 *   - server  : 5xx / 408 / 425 / 429 (transient, retry)
 *   - notFound: 404 (record gone server-side — re-register, do not blindly retry)
 *   - client  : other deterministic 4xx (do not retry)
 */
export const classifyError = err => {
  const status = err && typeof err.status === 'number' ? err.status : null;

  if (status === null) {
    return 'network';
  }

  if (status === 404) {
    return 'notFound';
  }

  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return 'server';
  }

  return 'client';
};

/**
 * Whether a classification should be retried with backoff.
 * `notFound` is intentionally NOT retryable here — the caller handles it by
 * switching an update into a re-registration.
 *
 * @param {string} classification - Output of classifyError.
 * @returns {boolean}
 */
export const isRetryable = classification => classification === 'network' || classification === 'server';

/**
 * Computes the delay (ms) before the next retry using capped exponential backoff
 * with +/-20% jitter. Jitter de-synchronizes a fleet-wide retry herd.
 *
 * @param {number} attempts - Number of attempts already made (>= 1).
 * @param {Function} [rand=Math.random] - RNG returning [0,1); injectable for tests.
 * @returns {number} A positive integer delay in milliseconds.
 */
export const computeBackoffMs = (attempts, rand = Math.random) => {
  const safeAttempts = Math.max(1, attempts | 0);
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, safeAttempts - 1));
  const jitterFactor = 1 + JITTER_RATIO * (rand() * 2 - 1);

  return Math.max(1000, Math.round(exp * jitterFactor));
};

/**
 * Decides whether a still-failing registration should be surfaced as a log.
 * Escalates exactly once per stuck episode: after enough attempts OR after the
 * record has been pending long enough (which also covers a permanently-offline
 * user whose attempts never increment).
 *
 * @param {{attempts: number, firstAttemptAt: number, reported: boolean}} record
 * @param {number} now - Current epoch time (ms).
 * @returns {boolean}
 */
export const shouldEscalate = (record, now) => {
  if (!record || record.reported) {
    return false;
  }

  return record.attempts >= MAX_ATTEMPTS_BEFORE_ESCALATE ||
    (now - record.firstAttemptAt) >= STUCK_AGE_MS;
};
