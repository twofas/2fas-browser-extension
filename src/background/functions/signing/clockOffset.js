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

/* global fetch, AbortController, setTimeout, clearTimeout */
import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';

// The backend rejects signed requests whose timestamp is more than ±5 min from
// server time. A machine with a skewed clock would fail EVERY signed request,
// so the observed server time (Date response header) is tracked as an offset
// and applied when signing. storage.session keeps it per browser session —
// stale offsets never outlive a restart.
const CLOCK_OFFSET_KEY = 'signingClockOffsetMs';

// When (local ms) a server Date was first seen this session. Before the first
// signature of a session nothing has been observed, so the clock is primed
// with one GET /health — its Date header is the server time — instead of
// sending a possibly skewed signature the backend would reject and log.
const CLOCK_OBSERVED_KEY = 'signingClockObservedAt';

// When (local ms) /health was last asked; a failed priming is not repeated
// within PRIME_RETRY_MS. Session storage, so a service-worker restart does
// not ask again either.
const PRIME_ATTEMPTED_KEY = 'signingClockPrimeAttemptedAt';
const PRIME_RETRY_MS = 60000;
const PRIME_TIMEOUT_MS = 5000;

/** Offsets smaller than this are noise (network latency), not clock skew. */
const APPLY_THRESHOLD_MS = 30000;

/** Persist only meaningful changes to avoid a storage write per API response. */
const STORE_DELTA_MS = 5000;

/** The backend's signature-timestamp window (2fas-server `defaultMaxClockSkew`). */
const SERVER_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The Date header is truncated to whole seconds and stamped after the backend's
 * time check, so a timestamp the backend rejected can read up to ~1 s inside
 * the window here. The allowance keeps such a rejection classified as skew.
 */
const DATE_HEADER_SLACK_MS = 2000;

/**
 * One priming attempt (see primeServerClock).
 *
 * @async
 * @returns {Promise<?number>} The offset /health revealed (server minus local, ms), or null.
 */
const primeServerClockOnce = async () => {
  try {
    const stored = await loadFromSessionStorage([CLOCK_OBSERVED_KEY, PRIME_ATTEMPTED_KEY]);

    if (typeof stored?.[CLOCK_OBSERVED_KEY] === 'number') {
      return null;
    }

    const attemptedAt = stored?.[PRIME_ATTEMPTED_KEY];

    // Absolute: the clock step that corrects a skewed machine (NTP) can move
    // the local clock back past the attempt, which must not silence priming.
    if (typeof attemptedAt === 'number' && Math.abs(Date.now() - attemptedAt) < PRIME_RETRY_MS) {
      return null;
    }

    await saveToSessionStorage({ [PRIME_ATTEMPTED_KEY]: Date.now() }).catch(() => {});
  } catch (err) {
    // storage.session unavailable — no memory of an observation; ask anyway.
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRIME_TIMEOUT_MS);

  try {
    // Any status will do: the Date header is what matters, and /health is
    // public, side-effect free and answered before every other middleware.
    const res = await fetch(`${process.env.API_URL}/health`, { method: 'GET', signal: controller.signal });

    return await noteServerDate(res?.headers?.get?.('date'));
  } catch (err) {
    // Offline, blocked, or timed out — the raw clock is used; a skewed one
    // still recovers through the re-sign after a 401.
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Single flight: two signatures racing at session start (a token request and
// the registration flush, a log and either) share one /health — and both get
// its answer. Without it the second caller would see the throttle stamp the
// first one wrote and sign with the raw clock.
let primeInFlight = null;

/**
 * Asks GET /health for the server time (its Date header) when no response of
 * this session carried one yet. Best effort: unreachable, no Date, or a
 * storage failure leave the raw local clock, and a failed attempt is not
 * repeated within PRIME_RETRY_MS. Never throws.
 *
 * @returns {Promise<?number>} The offset revealed by this priming (also handed
 *   to concurrent callers), or null when nothing was asked or learned.
 */
const primeServerClock = () => {
  if (!primeInFlight) {
    primeInFlight = primeServerClockOnce().finally(() => {
      primeInFlight = null;
    });
  }

  return primeInFlight;
};

/**
 * Whether an observed offset is worth applying: below the noise threshold the
 * raw clock is used.
 *
 * @param {*} offset - A stored or freshly observed offset.
 * @returns {boolean}
 */
const isApplicable = offset => typeof offset === 'number' && Number.isFinite(offset) && Math.abs(offset) >= APPLY_THRESHOLD_MS;

/**
 * Returns the clock offset (server minus local, ms) to apply when signing,
 * or 0 when none was observed / the offset is below the noise threshold.
 *
 * @async
 * @param {Object} [options={}]
 * @param {boolean} [options.prime=false] - Ask /health first when no server
 *   Date was seen this session (the first signature of a session). The
 *   answer is used even when storage.session could not keep it.
 * @returns {Promise<number>}
 */
const getClockOffsetMs = async ({ prime = false } = {}) => {
  const primed = prime ? await primeServerClock() : null;

  try {
    const stored = await loadFromSessionStorage(CLOCK_OFFSET_KEY);
    const offset = stored?.[CLOCK_OFFSET_KEY];

    if (isApplicable(offset)) {
      return offset;
    }
  } catch (err) {
    // storage.session unavailable — only what this call just learned applies.
  }

  return isApplicable(primed) ? primed : 0;
};

/**
 * Records the server clock from an API response's Date header. Best-effort:
 * failures (missing/invalid header, storage.session unavailable) are ignored.
 *
 * @async
 * @param {?string} dateHeader - The raw Date response header value.
 * @returns {Promise<?number>} The observed offset (server minus local, ms) —
 *   returned even when it could not be persisted — or null without a usable header.
 */
const noteServerDate = async dateHeader => {
  if (!dateHeader) {
    return null;
  }

  const serverMs = Date.parse(dateHeader);

  if (Number.isNaN(serverMs)) {
    return null;
  }

  const offset = serverMs - Date.now();

  try {
    const stored = await loadFromSessionStorage([CLOCK_OFFSET_KEY, CLOCK_OBSERVED_KEY]);
    const previous = typeof stored?.[CLOCK_OFFSET_KEY] === 'number' ? stored[CLOCK_OFFSET_KEY] : 0;
    const write = {};

    if (Math.abs(offset - previous) >= STORE_DELTA_MS) {
      write[CLOCK_OFFSET_KEY] = offset;
    }

    if (typeof stored?.[CLOCK_OBSERVED_KEY] !== 'number') {
      write[CLOCK_OBSERVED_KEY] = Date.now();
    }

    if (Object.keys(write).length > 0) {
      await saveToSessionStorage(write);
    }
  } catch (err) {
    // storage.session unavailable — later signing falls back to the raw local clock.
  }

  return offset;
};

/**
 * Whether a 401 on a signed request is explained by clock skew: the signature
 * timestamp sent lies outside the backend's window relative to the server clock
 * in the response's Date header. The backend checks the timestamp before the
 * signature, so such a 401 says nothing about the registration — the request
 * only needs re-signing with a corrected clock.
 *
 * @param {?string} signedTimestamp - The signature timestamp header sent (absent when unsigned).
 * @param {?string} dateHeader - The raw Date response header value.
 * @returns {boolean}
 */
const isClockSkewRejection = (signedTimestamp, dateHeader) => {
  if (!signedTimestamp || !dateHeader) {
    return false;
  }

  const signedMs = Date.parse(signedTimestamp);
  const serverMs = Date.parse(dateHeader);

  if (Number.isNaN(signedMs) || Number.isNaN(serverMs)) {
    return false;
  }

  return Math.abs(serverMs - signedMs) > SERVER_MAX_CLOCK_SKEW_MS - DATE_HEADER_SLACK_MS;
};

export { getClockOffsetMs, noteServerDate, isClockSkewRejection, CLOCK_OFFSET_KEY, CLOCK_OBSERVED_KEY, APPLY_THRESHOLD_MS };
