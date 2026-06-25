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

import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const DEVICES_KEY = 'devices';
const EXCLUDED_DOMAINS_KEY = 'autoSubmitExcludedDomains';

// Per-key mutex. `saveToLocalStorage` is a plain set with no read-modify-write
// guard, so two overlapping load→mutate→save cycles on the same key can lose a
// write (e.g. a background device sync racing the options page removing a
// device). Chaining every mutation of a key onto the previous one serializes
// those cycles so each reducer sees the result of the one before it.
const queues = new Map();

/**
 * Runs an async task with exclusive access to a key, after any in-flight task on
 * the same key has settled. Rejections are isolated to their own call and never
 * wedge the queue for subsequent mutations.
 *
 * @param {string} key - The storage key whose mutations are serialized.
 * @param {Function} task - A zero-arg function returning a Promise.
 * @returns {Promise<*>} The task's result.
 */
const withListLock = (key, task) => {
  const previous = queues.get(key) || Promise.resolve();
  const result = previous.then(task, task);

  // Keep the chain alive regardless of this task's outcome; swallow the settled
  // value so a rejection here doesn't reject the next caller's `previous`.
  queues.set(key, result.then(() => {}, () => {}));

  return result;
};

/**
 * Atomically read-modify-writes an array-valued storage key. The reducer runs
 * inside the per-key lock against the freshly read current value.
 *
 * @param {string} key - The storage key to mutate (its value is treated as an array).
 * @param {Function} reducer - `(currentArray) => newArray`, or `null`/`undefined` to signal
 *   "no change" — the write is then skipped and the current value is returned.
 * @param {Function} [deriveExtra] - Optional `(newArray) => ({...})` of extra keys to persist alongside.
 * @returns {Promise<Array>} The persisted array (or the unchanged current value on a no-op).
 */
const mutateList = (key, reducer, deriveExtra) => withListLock(key, async () => {
  const data = await loadFromLocalStorage([key]);
  const current = Array.isArray(data[key]) ? data[key] : [];
  const next = reducer(current.slice());

  // A reducer returns null/undefined to mean "nothing changed" — skip the write
  // so the hot path (e.g. a device sync that finds no diff) doesn't churn storage.
  if (next === null || next === undefined) {
    return current;
  }

  const patch = { [key]: next };

  if (typeof deriveExtra === 'function') {
    Object.assign(patch, deriveExtra(next));
  }

  await saveToLocalStorage(patch);
  return next;
});

const mutateDevices = reducer => mutateList(DEVICES_KEY, reducer, next => ({ configured: next.length > 0 }));

const mutateExcludedDomains = reducer => mutateList(EXCLUDED_DOMAINS_KEY, reducer);

export { mutateList, mutateDevices, mutateExcludedDomains, DEVICES_KEY, EXCLUDED_DOMAINS_KEY };
