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

import { loadFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';

// The backend rejects signed requests whose timestamp is more than ±5 min from
// server time. A machine with a skewed clock would fail EVERY signed request,
// so the observed server time (Date response header) is tracked as an offset
// and applied when signing. storage.session keeps it per browser session —
// stale offsets never outlive a restart.
const CLOCK_OFFSET_KEY = 'signingClockOffsetMs';

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
 * Returns the clock offset (server minus local, ms) to apply when signing,
 * or 0 when none was observed / the offset is below the noise threshold.
 *
 * @async
 * @returns {Promise<number>}
 */
const getClockOffsetMs = async () => {
  try {
    const stored = await loadFromSessionStorage(CLOCK_OFFSET_KEY);
    const offset = stored?.[CLOCK_OFFSET_KEY];

    if (typeof offset !== 'number' || !Number.isFinite(offset) || Math.abs(offset) < APPLY_THRESHOLD_MS) {
      return 0;
    }

    return offset;
  } catch (err) {
    return 0;
  }
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
    const stored = await loadFromSessionStorage(CLOCK_OFFSET_KEY);
    const previous = typeof stored?.[CLOCK_OFFSET_KEY] === 'number' ? stored[CLOCK_OFFSET_KEY] : 0;

    if (Math.abs(offset - previous) >= STORE_DELTA_MS) {
      await saveToSessionStorage({ [CLOCK_OFFSET_KEY]: offset });
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

export { getClockOffsetMs, noteServerDate, isClockSkewRejection, CLOCK_OFFSET_KEY, APPLY_THRESHOLD_MS };
