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
import {
  HEADER_SIGNATURE,
  HEADER_SIGNATURE_NONCE,
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_BODY_SHA256
} from '@background/functions/signing/signingHeaderNames.js';
import { getSigningState } from '@background/functions/signing/signingState.js';
import { saveToLocalStorage } from '@localStorage/index.js';

const jsonResponse = (status, body = '{}', headers = {}) => new Response(body, {
  status,
  headers: { 'Content-Type': 'application/json', ...headers }
});

let fetchMock;

const activateSigning = async () => {
  const material = await generateSigningKeyMaterial();

  await saveToLocalStorage({
    keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
    signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 },
    nativePush: true
  });
};

const sentHeaders = call => call[1].headers;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SDK request signing', () => {
  it('attaches the five signature headers to request2FAToken when signing is active', async () => {
    await activateSigning();
    fetchMock.mockResolvedValue(jsonResponse(200, '{"token_request_id":"r1"}'));

    await new SDK().request2FAToken('ext-id', 'https://example.com');

    const headers = sentHeaders(fetchMock.mock.calls[0]);
    expect(headers[HEADER_SIGNATURE_VERSION]).toBe('1');
    expect(headers[HEADER_SIGNATURE]).toBeTruthy();
    expect(headers[HEADER_SIGNATURE_NONCE]).toBeTruthy();
    expect(headers[HEADER_SIGNATURE_TIMESTAMP]).toMatch(/Z$/);
    expect(headers[HEADER_BODY_SHA256]).toBeTruthy();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends unsigned requests while signing is not active', async () => {
    await saveToLocalStorage({ signing: { active: false } });
    fetchMock.mockResolvedValue(jsonResponse(200, '{"token_request_id":"r1"}'));

    await new SDK().request2FAToken('ext-id', 'https://example.com');

    const headers = sentHeaders(fetchMock.mock.calls[0]);
    expect(headers[HEADER_SIGNATURE]).toBeUndefined();
  });

  it('NEVER signs createExtensionInstance — the create route is public', async () => {
    await activateSigning();
    fetchMock.mockResolvedValue(jsonResponse(200, '{"id":"new"}'));

    await new SDK().createExtensionInstance({ name: 'x', browser_name: 'Chrome', browser_version: '1', public_key: 'pk' });

    const headers = sentHeaders(fetchMock.mock.calls[0]);
    expect(headers[HEADER_SIGNATURE]).toBeUndefined();
    expect(headers[HEADER_SIGNATURE_VERSION]).toBeUndefined();
  });

  it('signs updateBrowserExtension, removePairedDevice, close2FARequest and storeLog', async () => {
    await activateSigning();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200)));

    const sdk = new SDK();
    await sdk.updateBrowserExtension('ext-id', { name: 'n', browser_name: 'b', browser_version: '1' });
    await sdk.removePairedDevice('ext-id', 'dev-id');
    await sdk.close2FARequest('ext-id', 'req-id', true);
    await sdk.storeLog('ext-id', 'error', 'm', { logID: 1 });

    for (const call of fetchMock.mock.calls) {
      expect(sentHeaders(call)[HEADER_SIGNATURE]).toBeTruthy();
    }
  });

  it('re-signs every retry attempt of getAllPairedDevices with a fresh nonce', async () => {
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, '[]'));

    const devices = await new SDK().getAllPairedDevices('ext-id');

    expect(devices).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = sentHeaders(fetchMock.mock.calls[0]);
    const second = sentHeaders(fetchMock.mock.calls[1]);
    expect(first[HEADER_SIGNATURE_NONCE]).toBeTruthy();
    expect(second[HEADER_SIGNATURE_NONCE]).toBeTruthy();
    expect(first[HEADER_SIGNATURE_NONCE]).not.toBe(second[HEADER_SIGNATURE_NONCE]);
  }, 15000);

  it('three consecutive 401s flip signing.registrationRequired via the response tap', async () => {
    await activateSigning();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(401, '')));

    const sdk = new SDK();
    await sdk.removePairedDevice('ext-id', 'd1').catch(() => {});
    await sdk.removePairedDevice('ext-id', 'd2').catch(() => {});
    await sdk.removePairedDevice('ext-id', 'd3').catch(() => {});

    // The tap is fire-and-forget — give its storage writes a tick to land.
    await new Promise(resolve => setTimeout(resolve, 50));

    expect((await getSigningState()).registrationRequired).toBe(true);
  });

  it('a success resets the 401 streak through the same tap', async () => {
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, ''))
      .mockResolvedValueOnce(jsonResponse(401, ''))
      .mockResolvedValueOnce(jsonResponse(200, '{}'));

    const sdk = new SDK();
    await sdk.removePairedDevice('ext-id', 'd1').catch(() => {});
    await sdk.removePairedDevice('ext-id', 'd2').catch(() => {});
    await sdk.removePairedDevice('ext-id', 'd3').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 50));

    const state = await getSigningState();
    expect(state.registrationRequired).toBe(false);
    expect(state.auth401Count).toBe(0);
  });
});
