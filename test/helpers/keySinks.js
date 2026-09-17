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

// Key-safe sinks for tests. Every helper reports a number, never the text it
// scanned, so a failing assertion cannot print key material. Assert on
// `longestSurvivor(...) === 0` and on hit/call counts — never toContain/toBe/
// toEqual/toHaveBeenCalledWith/snapshots on a value that may carry a key.

/* global Buffer */
import { vi } from 'vitest';
import { DER_HEADER_PATTERNS } from '@partials/redactKeyMaterial.js';

const MIN_SURVIVOR_LENGTH = 8;
const MAX_FLATTEN_DEPTH = 6;
const PEM_ARMOR = /-----BEGIN [A-Z0-9 ]+-----/g;
const DER_HEADERS = DER_HEADER_PATTERNS.map(({ pattern }) => new RegExp(pattern.source, 'g'));
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'dir', 'trace', 'table'];

/**
 * Flattens a value (console arguments, a log payload, an Error) into one string
 * for scanning. Error name/message/stack/cause are read explicitly (they are
 * non-enumerable); binary data becomes base64 so a DER header inside raw bytes
 * is still visible to the pattern counters. Depth, cycles and throwing getters
 * are guarded.
 * @param {*} value - The value to flatten.
 * @param {number} [depth=0] - Current recursion depth.
 * @param {WeakSet} [seen=new WeakSet()] - Objects already visited.
 * @return {string} The flattened text. Never print it.
 */
const flatten = (value, depth = 0, seen = new WeakSet()) => {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return String(value);
  }

  if (typeof value === 'function' || depth >= MAX_FLATTEN_DEPTH || seen.has(value)) {
    return '';
  }

  seen.add(value);

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString('base64');
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
  }

  const parts = [];

  if (value instanceof Error) {
    try {
      parts.push(String(value.name), String(value.message), String(value.stack), flatten(value.cause, depth + 1, seen));
    } catch {}
  }

  let keys = [];

  try {
    keys = Object.keys(value);
  } catch {
    return parts.join('\n');
  }

  for (const key of keys) {
    try {
      parts.push(key, flatten(value[key], depth + 1, seen));
    } catch {}
  }

  return parts.join('\n');
};

/**
 * Length of the longest substring of `secret` (8 characters or more) that still
 * occurs in `text`, or 0 when no such substring survives.
 * @param {string|*} text - The redacted output; non-strings are flattened first.
 * @param {string} secret - The encoded key (or fragment) that must not survive.
 * @return {number} 0 when nothing of the secret survives.
 */
const longestSurvivor = (text, secret) => {
  const haystack = typeof text === 'string' ? text : flatten(text);

  if (typeof secret !== 'string' || secret.length < MIN_SURVIVOR_LENGTH || haystack.length < MIN_SURVIVOR_LENGTH) {
    return 0;
  }

  // Cheap pre-check: without one shared 8-gram there is no survivor.
  const grams = new Set();

  for (let i = 0; i + MIN_SURVIVOR_LENGTH <= haystack.length; i++) {
    grams.add(haystack.slice(i, i + MIN_SURVIVOR_LENGTH));
  }

  let shared = false;

  for (let i = 0; i + MIN_SURVIVOR_LENGTH <= secret.length && !shared; i++) {
    shared = grams.has(secret.slice(i, i + MIN_SURVIVOR_LENGTH));
  }

  if (!shared) {
    return 0;
  }

  // Longest common substring over two rolling rows.
  let previous = new Uint32Array(haystack.length + 1);
  let current = new Uint32Array(haystack.length + 1);
  let longest = 0;

  for (let i = 1; i <= secret.length; i++) {
    for (let j = 1; j <= haystack.length; j++) {
      current[j] = secret.charCodeAt(i - 1) === haystack.charCodeAt(j - 1) ? previous[j - 1] + 1 : 0;

      if (current[j] > longest) {
        longest = current[j];
      }
    }

    [previous, current] = [current, previous];
  }

  return longest >= MIN_SURVIVOR_LENGTH ? longest : 0;
};

/**
 * Counts DER key headers (base64/base64url) and PEM armor lines in a value.
 * One armored key counts twice (armor plus the DER header in its body).
 * @param {string|*} value - Text, or any value to flatten first.
 * @return {number} The number of hits.
 */
const countKeyHits = value => {
  const haystack = typeof value === 'string' ? value : flatten(value);
  const derHits = DER_HEADERS.reduce((total, pattern) => total + (haystack.match(pattern)?.length || 0), 0);

  return derHits + (haystack.match(PEM_ARMOR)?.length || 0);
};

/**
 * Opt-in console tripwire. Spies the console methods with an implementation
 * that counts calls and key hits and swallows the output: the real console is
 * never invoked, so a leaking producer cannot print a key into the test log.
 * Install it inside the test and call restore() in a finally/afterEach.
 * @param {Object} [options]
 * @param {string[]} [options.methods] - Console methods to spy.
 * @return {{hits: number, calls: number, restore: function(): void}}
 */
const installKeyConsoleTripwire = ({ methods = CONSOLE_METHODS } = {}) => {
  let hits = 0;
  let calls = 0;

  const spies = methods
    .filter(method => typeof console[method] === 'function')
    .map(method => vi.spyOn(console, method).mockImplementation((...args) => {
      calls += 1;
      hits += countKeyHits(args);
    }));

  return {
    get hits () {
      return hits;
    },
    get calls () {
      return calls;
    },
    restore () {
      spies.forEach(spy => spy.mockRestore());
    }
  };
};

export { countKeyHits, flatten, installKeyConsoleTripwire, longestSurvivor };
