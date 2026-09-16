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

/* global Response */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

// The real SDK signs here: the keyed PUT of a challenged install goes through
// signedFetch → getSigningHeaders, so the backend's middleware verifies it
// BEFORE the handler ever compares keys. A wrong held key therefore yields a
// 401 (dropped, log 27), never the 400 conflict path.
import storeLog from '@partials/storeLog.js';
import flushBrowserRegistration from './flushBrowserRegistration.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import { generateSigningKeyMaterial } from '@background/functions/signing/signingKeyStore.js';
import { HEADER_SIGNATURE } from '@background/functions/signing/signingHeaderNames.js';
import { getSigningState } from '@background/functions/signing/signingState.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { saveToSessionStorage } from '@sessionStorage/index.js';
import { CLOCK_OBSERVED_KEY } from '@background/functions/signing/clockOffset.js';

const BROWSER_INFO = { name: 'ext', browser_name: 'Chrome', browser_version: '140' };
const CHALLENGED = { active: false, conflict: false, registrationRequired: false, auth401Count: 1, challenged: true };

const response = (status, body = '') => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
const storedRecord = async () => (await loadFromLocalStorage(REGISTRATION_STORAGE_KEY))?.[REGISTRATION_STORAGE_KEY] || null;
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

let fetchMock;

beforeEach(async () => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  // The session's server clock is already known: the GET /health priming is
  // covered by index.clockSkew.test.js and would shift the scripted fetches here.
  await saveToSessionStorage({ [CLOCK_OBSERVED_KEY]: Date.now() });

  const material = await generateSigningKeyMaterial();

  await saveToLocalStorage({
    extensionID: 'ext-1',
    browserInfo: { ...BROWSER_INFO, browser_version: '139' },
    keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
    signing: CHALLENGED,
    nativePush: true,
    [REGISTRATION_STORAGE_KEY]: { op: 'update', payload: BROWSER_INFO, attempts: 0, firstAttemptAt: Date.now(), nextAttemptAt: Date.now(), reported: false }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('flushBrowserRegistration — the keyed PUT of a challenged install', () => {
  it('goes out with the key AND a signature; a 401 drops the record, logs 27 as signed and counts', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(401)));

    await flushBrowserRegistration();
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0];
    const { keys } = await loadFromLocalStorage(['keys']);
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body).public_signing_key === keys.signingPublicKey).toBe(true);
    expect(options.headers[HEADER_SIGNATURE]).toBeTruthy();

    expect(await storedRecord()).toBeNull();
    expect(storeLog).toHaveBeenCalledWith(
      'error',
      27,
      expect.objectContaining({ backendStatus: 401, backend: expect.objectContaining({ signed: true }) }),
      expect.stringContaining('non-retryable')
    );
    expect(await getSigningState()).toMatchObject({ active: false, conflict: false, auth401Count: 2 });
  });

  it('a 200 (the held key is the registered one) activates signing and commits the browser info', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response(200, '{"id":"ext-1"}')));

    await flushBrowserRegistration();
    await settle();

    expect(await storedRecord()).toBeNull();
    expect(await getSigningState()).toMatchObject({ active: true, conflict: false, auth401Count: 0, challenged: false });
    expect((await loadFromLocalStorage(['browserInfo'])).browserInfo).toMatchObject({ browser_version: '140' });
    expect(storeLog).not.toHaveBeenCalled();
  });
});
