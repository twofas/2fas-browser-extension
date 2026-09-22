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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const getAllPairedDevices = vi.fn();
vi.mock('@sdk/index.js', () => ({
  default: class {
    getAllPairedDevices (...args) {
      return getAllPairedDevices(...args);
    }
  }
}));

import browser from 'webextension-polyfill';
import config from '@/config.js';
import storeLog from '@partials/storeLog.js';
import loadDevicesList, { devicesErrorNotification } from './loadDevicesList.js';

const loadFailed = () => ({ name: 'TypeError', message: 'Load failed' });

beforeEach(() => {
  vi.clearAllMocks();
  getAllPairedDevices.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadDevicesList', () => {
  it('returns the API device list', async () => {
    getAllPairedDevices.mockResolvedValue([{ id: 'd1' }]);

    const res = await loadDevicesList('ext-1');

    expect(res.errorReason).toBe(null);
    expect(res.devices).toEqual([{ id: 'd1' }]);
    expect(getAllPairedDevices).toHaveBeenCalledWith('ext-1');
  });

  it('reports offline without calling the API', async () => {
    vi.stubGlobal('navigator', { onLine: false });

    const res = await loadDevicesList('ext-1');

    expect(res.errorReason).toBe('offline');
    expect(getAllPairedDevices).not.toHaveBeenCalled();
  });

  it('treats a non-array payload as an API error', async () => {
    getAllPairedDevices.mockResolvedValue({ unexpected: true });

    expect((await loadDevicesList('ext-1')).errorReason).toBe('apiError');
  });

  it('logs 21 for a failure that is not transport', async () => {
    getAllPairedDevices.mockRejectedValue({ status: 404, statusText: 'Not Found' });

    const res = await loadDevicesList('ext-1');

    expect(res.errorReason).toBe('apiError');
    expect(vi.mocked(storeLog).mock.calls.some(([level, id]) => level === 'error' && id === 21)).toBe(true);
  });

  it('keeps a network failure out of the logs', async () => {
    getAllPairedDevices.mockRejectedValue(loadFailed());

    const res = await loadDevicesList('ext-1');

    expect(res.errorReason).toBe('apiError');
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('reports blocked when the browser refused the request (no host access, API reachable)', async () => {
    getAllPairedDevices.mockRejectedValue(loadFailed());
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    // Plain GET /health answers; the one with our headers dies like a CORS block.
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      if (init.headers) {
        throw new TypeError('Load failed');
      }

      return new Response('{}', { status: 200 });
    }));

    const res = await loadDevicesList('ext-1');

    expect(res.errorReason).toBe('blocked');
    expect(res.devices).toBe(null);
  });
});

describe('devicesErrorNotification', () => {
  it('picks the notification that matches the reason', () => {
    expect(devicesErrorNotification('offline')).toBe(config.Texts.Error.NoInternet);
    expect(devicesErrorNotification('apiError')).toBe(config.Texts.Error.DevicesUnavailable);
  });

  it('adds no toast for a browser block: the overlay explains it', () => {
    // Texts.Error.ApiAccessBlocked says "open the extension options", which is
    // this page.
    expect(devicesErrorNotification('blocked')).toBe(null);
  });
});
