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

import SDK from './index.js';
import { generateSigningKeyMaterial } from '@background/functions/signing/signingKeyStore.js';
import { HEADER_SIGNATURE } from '@background/functions/signing/signingHeaderNames.js';
import { getSigningState } from '@background/functions/signing/signingState.js';
import { saveToLocalStorage } from '@localStorage/index.js';
import { saveToSessionStorage } from '@sessionStorage/index.js';
import { CLOCK_OBSERVED_KEY } from '@background/functions/signing/clockOffset.js';

// An install that holds the signing key the backend already has, but never
// recorded the activation (a lost PUT response), meets a backend that started
// verifying its row. No extra request is ever sent: the rejected unsigned
// request is what the backend would have rejected anyway, and every later
// request goes out signed with the held key.
const INACTIVE_SIGNING = { active: false, conflict: false, registrationRequired: false, auth401Count: 0 };

const response = status => new Response('', { status, headers: { 'Content-Type': 'application/json' } });
const signatureOf = call => call[1].headers[HEADER_SIGNATURE];

// The response tap writes the signing state fire-and-forget.
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

let fetchMock;

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await saveToLocalStorage({ signing: INACTIVE_SIGNING, nativePush: true });
  // The session's server clock is already known: the GET /health priming is
  // covered by index.clockSkew.test.js and would shift the scripted fetches here.
  await saveToSessionStorage({ [CLOCK_OBSERVED_KEY]: Date.now() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SDK — an inactive install signs once the backend rejects it unsigned', () => {
  it('signs every request after an unsigned 401, and the first verified success activates signing', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey } });
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockImplementation(() => Promise.resolve(response(200)));

    const sdk = new SDK();
    await expect(sdk.removePairedDevice('ext-id', 'd1')).rejects.toMatchObject({ status: 401, signed: false });
    await settle();

    await expect(sdk.removePairedDevice('ext-id', 'd2')).resolves.toEqual({});
    await settle();

    expect(signatureOf(fetchMock.mock.calls[0])).toBeUndefined();
    expect(signatureOf(fetchMock.mock.calls[1])).toBeTruthy();
    expect(await getSigningState()).toMatchObject({ active: true, conflict: false, auth401Count: 0 });

    // The self-heal's best-effort unpair rides on the same state.
    await sdk.removeAllPairedDevices('ext-id');
    expect(signatureOf(fetchMock.mock.calls[2])).toBeTruthy();
  });

  it('without a held key the unsigned 401s escalate to registrationRequired as before', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });
    fetchMock.mockResolvedValue(response(401));

    const sdk = new SDK();
    for (const deviceID of ['d1', 'd2', 'd3']) {
      await sdk.removePairedDevice('ext-id', deviceID).catch(() => {});
      await settle();
    }

    expect(fetchMock.mock.calls.every(call => signatureOf(call) === undefined)).toBe(true);
    expect(await getSigningState()).toMatchObject({ active: false, registrationRequired: true });
  });

  it('a held key the backend does not hold ends in registrationRequired, never in a signing loop', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey } });
    fetchMock.mockResolvedValue(response(401));

    const sdk = new SDK();
    for (const deviceID of ['d1', 'd2', 'd3']) {
      await sdk.removePairedDevice('ext-id', deviceID).catch(() => {});
      await settle();
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(signatureOf(fetchMock.mock.calls[1])).toBeTruthy();
    expect(await getSigningState()).toMatchObject({ active: false, registrationRequired: true });
  });
});
