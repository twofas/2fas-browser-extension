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

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
