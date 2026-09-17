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

// Every key below is generated at runtime and every assertion is a number or a
// boolean, so a failing test cannot print key material. The console tripwire
// swallows all output.

/* global crypto, Buffer */
import { describe, it, expect, vi, afterEach } from 'vitest';
import safeConsole from './safeConsole.js';
import { flatten, installKeyConsoleTripwire, longestSurvivor } from '@test/helpers/keySinks.js';

const EC_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };

let tripwire = null;

const generateP256Spki = async () => {
  const pair = await crypto.subtle.generateKey(EC_PARAMS, true, ['sign', 'verify']);

  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

afterEach(() => {
  tripwire?.restore();
  tripwire = null;
});

describe('safeConsole', () => {
  it('every argument is redacted', async () => {
    const [reasonKey, causeKey] = await Promise.all([generateP256Spki(), generateP256Spki()]);
    tripwire = installKeyConsoleTripwire();

    safeConsole.error('x', { Reason: reasonKey }, new Error('y', { cause: causeKey }));

    expect(tripwire.hits).toBe(0);
    expect(console.error.mock.calls.length).toBe(1);
    expect(tripwire.calls).toBe(1);

    const printed = flatten(console.error.mock.calls);

    expect(longestSurvivor(printed, reasonKey)).toBe(0);
    expect(longestSurvivor(printed, causeKey)).toBe(0);
  });

  it('warn and log redact too, each through its own console method', async () => {
    const key = await generateP256Spki();
    tripwire = installKeyConsoleTripwire();

    safeConsole.warn(`signing failed for ${key}`);
    safeConsole.log({ public_signing_key: key });

    expect(tripwire.hits).toBe(0);
    expect(console.warn.mock.calls.length).toBe(1);
    expect(console.log.mock.calls.length).toBe(1);
    expect(console.error.mock.calls.length).toBe(0);
    expect(longestSurvivor(flatten([console.warn.mock.calls, console.log.mock.calls]), key)).toBe(0);
  });

  it('keeps benign diagnostics readable', () => {
    tripwire = installKeyConsoleTripwire();

    safeConsole.error('flushBrowserRegistration - loadRecord', 42, null, { status: 500, statusText: 'Internal Server Error' }, new TypeError('Failed to fetch'));

    const [label, count, empty, info, printedError] = console.error.mock.calls[0];

    expect(label === 'flushBrowserRegistration - loadRecord').toBe(true);
    expect(count === 42 && empty === null).toBe(true);
    expect(info.status === 500 && info.statusText === 'Internal Server Error').toBe(true);
    expect(printedError.name === 'TypeError' && printedError.message === 'Failed to fetch').toBe(true);
    expect(typeof printedError.stack === 'string').toBe(true);
  });

  it('never throws, not for an unwalkable value and not for a failing console', () => {
    const hostile = new Proxy({}, { ownKeys () { throw new Error('ownKeys'); } });
    const getter = { get secret () { throw new Error('getter'); } };
    const throwing = vi.spyOn(console, 'error').mockImplementation(() => { throw new Error('console closed'); });

    try {
      expect(() => safeConsole.error('ctx', hostile, getter)).not.toThrow();
      expect(throwing.mock.calls.length).toBe(1);
    } finally {
      throwing.mockRestore();
    }
  });

  it('exposes only error, warn and log', () => {
    expect(Object.keys(safeConsole).sort().join(',')).toBe('error,log,warn');
    expect(Object.isFrozen(safeConsole)).toBe(true);
  });
});
