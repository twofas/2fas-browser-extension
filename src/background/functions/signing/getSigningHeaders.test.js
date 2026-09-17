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

/* global crypto */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import storeLog from '@partials/storeLog.js';
import getSigningHeaders from './getSigningHeaders.js';
import { generateSigningKeyMaterial, saveSigningKey } from './signingKeyStore.js';
import { HEADER_SIGNATURE, HEADER_SIGNATURE_NONCE } from './signingHeaderNames.js';
import { saveToLocalStorage } from '@localStorage/index.js';
import { removeFromSessionStorage, saveToSessionStorage } from '@sessionStorage/index.js';
import { CLOCK_OBSERVED_KEY } from './clockOffset.js';

const URL_UNDER_TEST = 'https://api.example.test/browser_extensions/abc/commands/request_2fa_token';

beforeEach(async () => {
  vi.clearAllMocks();
  // The session's server clock is already known: no GET /health priming here
  // (the priming describe below clears this and stubs fetch).
  await saveToSessionStorage({ [CLOCK_OBSERVED_KEY]: Date.now() });
});

describe('getSigningHeaders', () => {
  it('returns {} while signing is not active (migration window, unregistered key)', async () => {
    await saveToLocalStorage({ signing: { active: false, conflict: false } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('returns {} in the conflict state even with a usable key — signing with the wrong key would 401', async () => {
    await generateSigningKeyMaterial();
    await saveToLocalStorage({ signing: { active: true, conflict: true } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
  });

  it('signs when active with a usable key, fresh nonce per call', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: true, conflict: false }
    });

    const a = await getSigningHeaders('POST', URL_UNDER_TEST, '{"domain":"x"}');
    const b = await getSigningHeaders('POST', URL_UNDER_TEST, '{"domain":"x"}');

    expect(a[HEADER_SIGNATURE]).toBeTruthy();
    expect(a[HEADER_SIGNATURE_NONCE]).not.toBe(b[HEADER_SIGNATURE_NONCE]);
  });

  it('degrades to {} and logs 65 when the key is unusable while active', async () => {
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: 'registered-but-lost' },
      signing: { active: true, conflict: false }
    });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
    expect(storeLog).toHaveBeenCalledWith('error', 65, expect.anything(), 'getSigningHeaders');
  });

  it('skipLog suppresses the storeLog call (storeLog path must never recurse)', async () => {
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: 'registered-but-lost' },
      signing: { active: true, conflict: false }
    });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}', { skipLog: true })).toEqual({});
    expect(storeLog).not.toHaveBeenCalled();
  });
});

describe('getSigningHeaders — challenged (an unsigned request was rejected while inactive)', () => {
  it('signs with the held key while challenged even though signing is not active yet', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: false, conflict: false, challenged: true }
    });

    const headers = await getSigningHeaders('DELETE', 'https://api.example.test/browser_extensions/abc/devices', '');

    expect(headers[HEADER_SIGNATURE]).toBeTruthy();
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('returns {} silently while challenged when there is no signing key to try', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signing: { active: false, conflict: false, challenged: true } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('never signs in the conflict state, challenged or not', async () => {
    await generateSigningKeyMaterial();
    await saveToLocalStorage({ signing: { active: false, conflict: true, challenged: true } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
  });
});

describe('getSigningHeaders — a kept survivor without a stored public key', () => {
  it('signs while challenged: signing needs only the private half', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await saveSigningKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signing: { active: false, conflict: false, challenged: true } });

    const headers = await getSigningHeaders('POST', URL_UNDER_TEST, '{}');

    expect(headers[HEADER_SIGNATURE]).toBeTruthy();
    expect(storeLog).not.toHaveBeenCalled();
  });
});

describe('getSigningHeaders — the first signature of a session primes the server clock', () => {
  let fetchMock;

  beforeEach(async () => {
    await removeFromSessionStorage(CLOCK_OBSERVED_KEY);
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { Date: new Date().toUTCString() } }));
    vi.stubGlobal('fetch', fetchMock);

    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: true, conflict: false }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks GET /health once, before the first signature, and never again in the session', async () => {
    const first = await getSigningHeaders('POST', URL_UNDER_TEST, '{}');
    const second = await getSigningHeaders('POST', URL_UNDER_TEST, '{}');

    expect(first[HEADER_SIGNATURE] && second[HEADER_SIGNATURE]).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.test/health');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('an explicit clock offset (the re-sign after a skew 401) signs without asking', async () => {
    const headers = await getSigningHeaders('POST', URL_UNDER_TEST, '{}', { clockOffsetMs: 60000 });

    expect(headers[HEADER_SIGNATURE]).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unsigned request (signing inactive) never asks', async () => {
    await saveToLocalStorage({ signing: { active: false, conflict: false } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
