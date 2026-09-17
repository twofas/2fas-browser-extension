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

// Every key below is generated at runtime and every assertion on logged output
// is a number or a boolean (longestSurvivor, counts, `=== marker`), so a
// failing test cannot print key material. The console tripwire swallows all
// output. storeLog debounces per (logID, message) for 30 s in module state, so
// every call in this file uses its own pair and no test depends on another.

/* global crypto, Buffer */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdkStoreLog = vi.fn().mockResolvedValue({});
vi.mock('../sdk/index.js', () => ({
  default: class SDK {
    storeLog (...args) { return sdkStoreLog(...args); }
  }
}));

import storeLog, { sanitizeLogValue } from './storeLog.js';
import { saveToLocalStorage } from '../localStorage/index.js';
import { flatten, installKeyConsoleTripwire, longestSurvivor } from '@test/helpers/keySinks.js';

const EC_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' };
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'dir', 'trace', 'table'];

let tripwire = null;

const generateP256Spki = async () => {
  const pair = await crypto.subtle.generateKey(EC_PARAMS, true, ['sign', 'verify']);

  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

// The shape SDK.onError rejects with for an HTTP error, carrying the backend's
// signing-key conflict Reason (both keys quoted with %q).
const conflictError = (previous, next) => ({
  status: 400,
  statusText: 'Bad Request',
  url: 'https://api.example.test/browser_extensions/3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  signed: false,
  content: {
    Code: 400,
    Type: 'BadRequest',
    Description: 'Bad Request',
    Reason: `cannot update key from "${previous}" to "${next}": browser extension already has public signing key`
  }
});

// What SDK.storeLog puts on the wire, plus the raw call arguments.
const wireTexts = () => sdkStoreLog.mock.calls.flatMap(([, level, message, context]) => [
  JSON.stringify({ level, message, context: JSON.stringify(context) }),
  flatten([level, message, context])
]);

const maxSurvivor = (texts, secrets) => Math.max(0, ...texts.flatMap(text => secrets.map(secret => longestSurvivor(text, secret))));

const consoleArgs = () => CONSOLE_METHODS.flatMap(method => console[method]?.mock?.calls || []).flat();

beforeEach(async () => {
  vi.clearAllMocks();
  tripwire = installKeyConsoleTripwire({ methods: CONSOLE_METHODS });
  await saveToLocalStorage({ logging: true, extensionID: 'ext-1', browserInfo: { name: 'ext' } });
});

afterEach(() => {
  tripwire.restore();
  tripwire = null;
});

describe('storeLog: key material is redacted before every sink', () => {
  it('log 64 SDK-shaped conflict: wire and console key-free', async () => {
    const [previous, next] = await Promise.all([generateP256Spki(), generateP256Spki()]);

    await storeLog('warning', 64, conflictError(previous, next), 'signingState - markSigningConflict');

    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(maxSurvivor(wireTexts(), [previous, next])).toBe(0);
    expect(tripwire.hits).toBe(0);
    expect(maxSurvivor([flatten(consoleArgs())], [previous, next])).toBe(0);
    expect(console.dir.mock.calls.length).toBe(0);
  });

  it('logging disabled: console key-free, backend untouched', async () => {
    await saveToLocalStorage({ logging: false });
    const [previous, next] = await Promise.all([generateP256Spki(), generateP256Spki()]);

    await storeLog('warning', 64, conflictError(previous, next), 'signingState - markSigningConflict');

    expect(tripwire.hits).toBe(0);
    expect(maxSurvivor([flatten(consoleArgs())], [previous, next])).toBe(0);
    expect(sdkStoreLog.mock.calls.length).toBe(0);
    // Developers keep a (redacted) diagnostic with logging off.
    expect(tripwire.calls > 0).toBe(true);
  });

  it('binary reaches the backend as a length marker', async () => {
    await storeLog('error', 21, { message: 'binary-payload', bytes: new Uint8Array(32) }, 'storeLog.redaction.test');

    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(sdkStoreLog.mock.calls[0][3].errorInfo.bytes === '[binary:32]').toBe(true);
  });

  it('registration shape 27 with key-echoing backendContent is key-free; 407 still filtered', async () => {
    const key = await generateP256Spki();
    const registration = (message, backendStatus, backendStatusText) => ({
      message,
      name: 'RegistrationError',
      op: 'update',
      attempts: 3,
      pendingForMs: 1000,
      online: true,
      backendStatus,
      backendStatusText,
      backendContent: {
        Code: backendStatus,
        Type: 'BadRequest',
        Description: 'Bad Request',
        Reason: `Key: 'UpdateBrowserExtensionRequest.PublicSigningKey' Error:Field validation for 'PublicSigningKey' failed on the 'ecdsa_p256_public_key' tag (${key})`
      },
      stack: null,
      cause: null
    });

    await storeLog('error', 27, registration('registration-400-echo', 400, 'Bad Request'), 'flushBrowserRegistration - update - non-retryable');

    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(maxSurvivor(wireTexts(), [key])).toBe(0);

    await storeLog('error', 27, registration('registration-407-echo', 407, 'Proxy Authentication Required'), 'flushBrowserRegistration - update - stuck');

    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(tripwire.hits).toBe(0);
  });

  it('non-string message, status texts and url label do not throw', async () => {
    const outcome = promise => promise.then(() => 'resolved', () => 'rejected');

    const results = [
      await outcome(storeLog('error', 22, { message: { a: 1 } }, 'storeLog.redaction.test')),
      await outcome(storeLog('error', 22, { message: 'object-status-texts', statusText: { a: 1 }, backendStatusText: 42 }, 'storeLog.redaction.test')),
      await outcome(storeLog('error', 22, { message: 'null-url-label' }, null)),
      await outcome(storeLog('error', 22, { message: Object.create(null) }, 'storeLog.redaction.test'))
    ];

    expect(results.every(result => result === 'resolved')).toBe(true);
    expect(sdkStoreLog.mock.calls.length).toBe(4);
  });

  it('context.redactions counts markers', async () => {
    const key = await generateP256Spki();

    await storeLog('error', 65, { message: 'redactions-key-case', Reason: `request signing failed for ${key}` }, 'storeLog.redaction.test');
    await storeLog('error', 72, { message: 'redactions-benign-case', status: 500, statusText: 'Internal Server Error' }, 'storeLog.redaction.test');

    expect(sdkStoreLog.mock.calls.length).toBe(2);

    const [keyContext, benignContext] = sdkStoreLog.mock.calls.map(call => call[3]);

    expect(typeof keyContext.redactions?.count).toBe('number');
    expect(keyContext.redactions.count > 0).toBe(true);
    expect(Array.isArray(keyContext.redactions.kinds)).toBe(true);
    expect(typeof benignContext.redactions?.count).toBe('number');
    expect(benignContext.redactions.count).toBe(0);
  });

  it('Event errObj keeps extracted fields in the console', async () => {
    const event = new Event('error');
    // An own field storeLog does not extract: printing the raw Event would show it.
    event.socketUrl = 'https://ws.example.test/proxy/browser_extensions/3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

    await storeLog('error', 11, event, 'subscribeChannel');

    const printed = consoleArgs();
    const extracted = printed.filter(arg => arg !== null && typeof arg === 'object' && !(arg instanceof Event) && typeof arg.type === 'string');

    expect(extracted.length > 0).toBe(true);
    expect(flatten(printed).includes('https://')).toBe(false);
  });

  it('debounce key is built from redacted text, so two keys of one kind are one log', async () => {
    const [first, second] = await Promise.all([generateP256Spki(), generateP256Spki()]);

    await storeLog('error', 63, new Error(`signing registration failed for ${first}`), 'storeLog.redaction.test');
    await storeLog('error', 63, new Error(`signing registration failed for ${second}`), 'storeLog.redaction.test');

    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(maxSurvivor(wireTexts(), [first, second])).toBe(0);
  });

  it('key material in the url label is redacted on the wire, where context.url is not sanitized again', async () => {
    const key = await generateP256Spki();

    await storeLog('error', 23, { message: 'url-label-key' }, `storeLog.redaction.test - ${key}`);

    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(maxSurvivor(wireTexts(), [key])).toBe(0);

    const { url } = sdkStoreLog.mock.calls[0][3];
    expect(typeof url === 'string' && url.includes('[redacted:')).toBe(true);
    expect(tripwire.hits).toBe(0);
  });
});

describe('sanitizeLogValue: redaction before URL masking', () => {
  it('redacts a key glued to a URL, then masks the URL', async () => {
    const key = await generateP256Spki();
    const out = sanitizeLogValue(`request to https://api.example.test/x?k=${key} failed`);

    expect(longestSurvivor(out, key)).toBe(0);
    expect(out.includes('https://')).toBe(false);
    expect(out.endsWith(' failed')).toBe(true);
  });

  it('applies the type rules before walking', async () => {
    const pair = await crypto.subtle.generateKey(EC_PARAMS, false, ['sign', 'verify']);
    const out = sanitizeLogValue({ bytes: new Uint8Array(4), buffer: new ArrayBuffer(8), key: pair.privateKey });

    expect(out.bytes === '[binary:4]').toBe(true);
    expect(out.buffer === '[binary:8]').toBe(true);
    expect(out.key === '[CryptoKey]').toBe(true);
  });
});
