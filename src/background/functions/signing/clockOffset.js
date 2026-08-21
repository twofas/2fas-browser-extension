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
 * @returns {Promise<void>}
 */
const noteServerDate = async dateHeader => {
  if (!dateHeader) {
    return;
  }

  const serverMs = Date.parse(dateHeader);

  if (Number.isNaN(serverMs)) {
    return;
  }

  const offset = serverMs - Date.now();

  try {
    const stored = await loadFromSessionStorage(CLOCK_OFFSET_KEY);
    const previous = typeof stored?.[CLOCK_OFFSET_KEY] === 'number' ? stored[CLOCK_OFFSET_KEY] : 0;

    if (Math.abs(offset - previous) >= STORE_DELTA_MS) {
      await saveToSessionStorage({ [CLOCK_OFFSET_KEY]: offset });
    }
  } catch (err) {
    // storage.session unavailable — signing falls back to the raw local clock.
  }
};

export { getClockOffsetMs, noteServerDate, CLOCK_OFFSET_KEY, APPLY_THRESHOLD_MS };
