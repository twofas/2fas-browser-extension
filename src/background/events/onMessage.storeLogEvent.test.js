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

/* global crypto, Buffer */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installKeyConsoleTripwire, longestSurvivor } from '@test/helpers/keySinks.js';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const sdkStoreLog = vi.fn().mockResolvedValue({});
vi.mock('@sdk/index.js', () => ({
  LOG_LEVELS: ['info', 'warning', 'error', 'debug'],
  default: class SDK {
    storeLog (...args) { return sdkStoreLog(...args); }
  }
}));

import onMessage from './onMessage.js';
import { saveToLocalStorage } from '@localStorage/index.js';

const dispatch = request => new Promise(resolve => {
  onMessage(request, { tab: { id: 7 } }, resolve);
});

// Generated per run: no key literal in source, and assertions below only ever
// compare numbers and booleans derived from it.
const generateP256Spki = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('onMessage — storeLogEvent (content-script log proxy)', () => {
  it('forwards a valid proxied log to the SDK with the stored extensionID', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1', logging: true });

    const response = await dispatch({ action: 'storeLogEvent', level: 'error', message: 'Error', context: { logID: 14 } });

    expect(response).toEqual({ status: 'ok' });
    expect(sdkStoreLog).toHaveBeenCalledWith('ext-1', 'error', 'Error', { logID: 14 });
  });

  it('redacts key material in the proxied message and context before it reaches the SDK', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1', logging: true });
    const spki = await generateP256Spki();

    const response = await dispatch({
      action: 'storeLogEvent',
      level: 'warning',
      message: `m ${spki}`,
      context: { logID: 99, errorInfo: { Reason: `x ${spki}` } }
    });

    expect(response.status).toBe('ok');
    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(longestSurvivor(JSON.stringify(sdkStoreLog.mock.calls[0]), spki)).toBe(0);

    // The key-free parts of the entry still arrive.
    const [extensionID, level, message, context] = sdkStoreLog.mock.calls[0];
    expect(extensionID === 'ext-1' && level === 'warning' && message.startsWith('m ') && context.logID === 99).toBe(true);
  });

  it('acks without sending when logging is disabled or the extension is unregistered', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1', logging: false });

    const response = await dispatch({ action: 'storeLogEvent', level: 'error', message: 'Error', context: {} });

    expect(response).toEqual({ status: 'ok' });
    expect(sdkStoreLog).not.toHaveBeenCalled();
  });

  it('rejects an invalid level or missing message', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1', logging: true });

    expect(await dispatch({ action: 'storeLogEvent', level: 'verbose', message: 'x' })).toMatchObject({ status: 'error' });
    expect(await dispatch({ action: 'storeLogEvent', level: 'error' })).toMatchObject({ status: 'error' });
    expect(sdkStoreLog).not.toHaveBeenCalled();
  });

  it('reports an error status when the storage read fails, without recursing into storeLog', async () => {
    const browser = (await import('webextension-polyfill')).default;
    const spy = vi.spyOn(browser.storage.local, 'get').mockRejectedValue(new Error('storage down'));

    const response = await dispatch({ action: 'storeLogEvent', level: 'error', message: 'Error', context: {} });

    expect(response).toEqual({ status: 'error' });
    expect(sdkStoreLog).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('a failed proxied send prints no key material to the console', async () => {
    await saveToLocalStorage({ extensionID: 'ext-1', logging: true });
    const spki = await generateP256Spki();
    const tripwire = installKeyConsoleTripwire();
    let response;

    try {
      // The backend rejected the store_log and echoed a key in its Reason.
      sdkStoreLog.mockRejectedValueOnce({ status: 400, statusText: 'Bad Request', content: { Code: 400, Reason: `invalid context ${spki}` } });
      response = await dispatch({ action: 'storeLogEvent', level: 'warning', message: 'm', context: { logID: 98 } });
    } finally {
      tripwire.restore();
    }

    expect(response.status === 'error').toBe(true);
    expect(sdkStoreLog.mock.calls.length).toBe(1);
    expect(tripwire.calls > 0).toBe(true);
    expect(tripwire.hits).toBe(0);
  });
});
