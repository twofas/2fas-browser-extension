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
 * Wraps an async function so that bursts of identical calls are collapsed into a
 * single execution. This protects expensive/networked work from being hammered
 * when its trigger fires repeatedly (e.g. a user mashing the extension shortcut,
 * or the backend redelivering the same WebSocket message).
 *
 * Behaviour, per key:
 *   - Concurrent calls share one in-flight promise (de-duplication).
 *   - For `windowMs` after a call settles, the cached result is returned without
 *     invoking `fn` again (throttling).
 *   - Rejections are never cached, so a failed call lets the next call retry.
 *     Functions that resolve with an error flag (instead of rejecting) DO get
 *     cached, which is what stops error-log storms during an outage.
 *
 * @param {Function} fn - The async function to wrap.
 * @param {Object} [options] - Configuration options.
 * @param {number} [options.windowMs=2000] - How long (ms) to reuse the last result.
 * @param {Function} [options.keyFn] - Derives a cache key from the call arguments.
 * @returns {Function} A wrapped function returning a Promise.
 */
const createAsyncThrottle = (fn, { windowMs = 2000, keyFn = () => 'default' } = {}) => {
  const inFlight = new Map();
  const cache = new Map();

  return (...args) => {
    const key = keyFn(...args);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && (now - cached.time) < windowMs) {
      return Promise.resolve(cached.value);
    }

    const pending = inFlight.get(key);

    if (pending) {
      return pending;
    }

    const promise = Promise.resolve()
      .then(() => fn(...args))
      .then(value => {
        cache.set(key, { time: Date.now(), value });
        return value;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);

    return promise;
  };
};

export default createAsyncThrottle;
