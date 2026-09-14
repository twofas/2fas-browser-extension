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

import browser from 'webextension-polyfill';
import SDK from './index.js';
import { generateSigningKeyMaterial } from '@background/functions/signing/signingKeyStore.js';
import { HEADER_SIGNATURE_TIMESTAMP } from '@background/functions/signing/signingHeaderNames.js';
import { getSigningState } from '@background/functions/signing/signingState.js';
import { saveToLocalStorage } from '@localStorage/index.js';

// The 2026-09-14 production incident: the machine clock ran 13m23s behind the
// server, and the backend rejected the signed PUT with an empty-bodied 401.
const LOCAL_NOW = '2026-09-14T14:10:13Z';
const SERVER_DATE = 'Mon, 14 Sep 2026 14:23:36 GMT';
const SKEWED_TIMESTAMP = '2026-09-14T14:10:13Z';
const CORRECTED_TIMESTAMP = '2026-09-14T14:23:36Z';

const response = (status, body = '', headers = {}) => new Response(body, {
  status,
  headers: { 'Content-Type': 'application/json', ...headers }
});

const skewRejection = () => response(401, '', { Date: SERVER_DATE });
const serverOk = (body = '{}') => response(200, body, { Date: SERVER_DATE });
const sentTimestamp = call => call[1].headers[HEADER_SIGNATURE_TIMESTAMP];

// The response tap writes the signing state fire-and-forget.
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

const activateSigning = async () => {
  const material = await generateSigningKeyMaterial();

  await saveToLocalStorage({
    keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
    signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 },
    nativePush: true
  });
};

let fetchMock;

beforeEach(() => {
  // Only Date is faked: the signing key store, the storage doubles and the
  // SDK timeouts keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(LOCAL_NOW));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SDK — clock-skew 401 recovery', () => {
  it('re-signs a clock-skew 401 with the server clock and retries it once', async () => {
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(skewRejection())
      .mockResolvedValueOnce(serverOk());

    await expect(new SDK().updateBrowserExtension('ext-id', { name: 'n', browser_name: 'Chrome', browser_version: '140' }))
      .resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentTimestamp(fetchMock.mock.calls[0])).toBe(SKEWED_TIMESTAMP);
    expect(sentTimestamp(fetchMock.mock.calls[1])).toBe(CORRECTED_TIMESTAMP);
  });

  it('carries the corrected clock over to later requests in the session', async () => {
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(skewRejection())
      .mockImplementation(() => Promise.resolve(serverOk()));

    const sdk = new SDK();
    await sdk.updateBrowserExtension('ext-id', { name: 'n', browser_name: 'Chrome', browser_version: '140' });
    await sdk.removePairedDevice('ext-id', 'd1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sentTimestamp(fetchMock.mock.calls[2])).toBe(CORRECTED_TIMESTAMP);
  });

  it.each([
    ['getAllPairedDevices', sdk => sdk.getAllPairedDevices('ext-id')],
    ['removePairedDevice', sdk => sdk.removePairedDevice('ext-id', 'd1')],
    ['removeAllPairedDevices', sdk => sdk.removeAllPairedDevices('ext-id')],
    ['request2FAToken', sdk => sdk.request2FAToken('ext-id', 'https://example.com')],
    ['close2FARequest', sdk => sdk.close2FARequest('ext-id', 'req-id', true)],
    ['storeLog', sdk => sdk.storeLog('ext-id', 'error', 'm', { logID: 1 })]
  ])('%s recovers from a clock-skew 401 the same way', async (_, call) => {
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(skewRejection())
      .mockResolvedValueOnce(serverOk('[]'));

    await call(new SDK());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentTimestamp(fetchMock.mock.calls[1])).toBe(CORRECTED_TIMESTAMP);
  });

  it('re-signs with the server clock even when storage.session cannot keep the offset', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('storage.session unavailable'));
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(skewRejection())
      .mockResolvedValueOnce(serverOk());

    await expect(new SDK().updateBrowserExtension('ext-id', { name: 'n', browser_name: 'Chrome', browser_version: '140' }))
      .resolves.toEqual({});

    expect(sentTimestamp(fetchMock.mock.calls[1])).toBe(CORRECTED_TIMESTAMP);
  });

  it('never counts a clock-skew 401 toward registrationRequired, even when the retry is skewed too', async () => {
    // A backend node whose clock runs 13m23s ahead of whatever it receives:
    // the corrected retry is rejected for skew all over again.
    await activateSigning();
    fetchMock.mockImplementation((url, options) => {
      const signedMs = Date.parse(options.headers[HEADER_SIGNATURE_TIMESTAMP]);

      return Promise.resolve(response(401, '', { Date: new Date(signedMs + 803000).toUTCString() }));
    });

    const sdk = new SDK();
    for (const deviceID of ['d1', 'd2', 'd3']) {
      await expect(sdk.removePairedDevice('ext-id', deviceID)).rejects.toMatchObject({ status: 401 });
    }
    await settle();

    // Exactly one retry per call — never a loop.
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(await getSigningState()).toMatchObject({ auth401Count: 0, registrationRequired: false });
  });

  it('does not retry a 401 inside the clock window, and counts it', async () => {
    await activateSigning();
    fetchMock.mockImplementation(() => Promise.resolve(response(401, '', { Date: 'Mon, 14 Sep 2026 14:10:14 GMT' })));

    await new SDK().removePairedDevice('ext-id', 'd1').catch(() => {});
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await getSigningState()).auth401Count).toBe(1);
  });

  it('counts a 401 on the corrected retry exactly once — that rejection is not about the clock', async () => {
    await activateSigning();
    fetchMock
      .mockResolvedValueOnce(skewRejection())
      .mockResolvedValueOnce(response(401, '', { Date: SERVER_DATE }));

    await new SDK().removePairedDevice('ext-id', 'd1').catch(() => {});
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await getSigningState()).auth401Count).toBe(1);
  });

  it('does not retry an unsigned request, whatever the Date header says', async () => {
    await saveToLocalStorage({ signing: { active: false } });
    fetchMock.mockImplementation(() => Promise.resolve(skewRejection()));

    await new SDK().removePairedDevice('ext-id', 'd1').catch(() => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
