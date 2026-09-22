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
import syncDevicesWithAPI from './syncDevicesWithAPI.js';
import storeLog from '@partials/storeLog.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

beforeEach(() => {
  getAllPairedDevices.mockReset();
});

describe('syncDevicesWithAPI', () => {
  it('adds a new API device to the local cache and derives configured=true', async () => {
    getAllPairedDevices.mockResolvedValue([{ id: 'd1', public_key: 'k1' }]);

    const res = await syncDevicesWithAPI({ extensionID: 'ext-add', devices: [] });

    expect(res.hasDevices).toBe(true);
    expect(res.devicesChanged).toBe(true);
    expect(res.storage.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);

    const stored = await loadFromLocalStorage(['devices', 'configured']);
    expect(stored.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);
    expect(stored.configured).toBe(true);
  });

  it('clears the local cache and sets configured=false when the API reports no devices', async () => {
    await saveToLocalStorage({ devices: [{ device_id: 'd1', device_public_key: 'k1' }], configured: true });
    getAllPairedDevices.mockResolvedValue([]);

    const res = await syncDevicesWithAPI({ extensionID: 'ext-clear', devices: [{ device_id: 'd1', device_public_key: 'k1' }] });

    expect(res.hasDevices).toBe(false);
    expect(res.devicesChanged).toBe(true);
    expect(res.storage.devices).toEqual([]);

    const stored = await loadFromLocalStorage(['devices', 'configured']);
    expect(stored.configured).toBe(false);
  });

  it('reports no change when the API exactly matches the local cache', async () => {
    await saveToLocalStorage({ devices: [{ device_id: 'd1', device_public_key: 'k1' }] });
    getAllPairedDevices.mockResolvedValue([{ id: 'd1', public_key: 'k1' }]);

    const res = await syncDevicesWithAPI({ extensionID: 'ext-nochange', devices: [{ device_id: 'd1', device_public_key: 'k1' }] });

    expect(res.devicesChanged).toBe(false);
    expect(res.storage.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);
  });

  it('flags apiError when the API returns a non-array payload', async () => {
    getAllPairedDevices.mockResolvedValue(null);

    const res = await syncDevicesWithAPI({ extensionID: 'ext-bad', devices: [] });

    expect(res.apiError).toBe(true);
    expect(res.devicesChanged).toBe(false);
  });

  it('flags apiError when the API request throws', async () => {
    getAllPairedDevices.mockRejectedValue(new Error('network'));

    const res = await syncDevicesWithAPI({ extensionID: 'ext-throw', devices: [] });

    expect(res.apiError).toBe(true);
  });

  it('returns the default result without calling the API when there is no extensionID', async () => {
    const res = await syncDevicesWithAPI({});

    expect(res.hasDevices).toBe(false);
    expect(getAllPairedDevices).not.toHaveBeenCalled();
  });

  it('keeps caller storage unchanged on API error (no reconcile)', async () => {
    getAllPairedDevices.mockResolvedValue(null);

    const storage = { extensionID: 'ext-err', keys: { publicKey: 'p' }, devices: [{ device_id: 'd1', device_public_key: 'k1' }] };
    const res = await syncDevicesWithAPI(storage);

    expect(res.apiError).toBe(true);
    // Storage is returned untouched — no reconciled devices baked in.
    expect(res.storage).toBe(storage);
  });

  describe('throttle cache is storage-shape-independent (Z8)', () => {
    it('composes each caller\'s OWN storage shape, not the first caller\'s cached one', async () => {
      getAllPairedDevices.mockResolvedValue([{ id: 'd1', public_key: 'k1' }]);

      // Same extensionID within the throttle window → one API call, shared devices.
      const first = await syncDevicesWithAPI({ extensionID: 'ext-shape', keys: { publicKey: 'p' }, devices: [] });
      const second = await syncDevicesWithAPI({ extensionID: 'ext-shape', browserInfo: { name: 'X' }, devices: [] });

      expect(getAllPairedDevices).toHaveBeenCalledTimes(1); // throttled

      // Each caller keeps its own extra keys; neither inherits the other's shape.
      expect(first.storage.keys).toEqual({ publicKey: 'p' });
      expect(first.storage.browserInfo).toBeUndefined();
      expect(second.storage.browserInfo).toEqual({ name: 'X' });
      expect(second.storage.keys).toBeUndefined();

      // Both still carry the same reconciled devices.
      expect(first.storage.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);
      expect(second.storage.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);
    });
  });

  describe('fresh bypass for the security check (Z8)', () => {
    it('hits the API on every call when fresh:true, even within the throttle window', async () => {
      getAllPairedDevices.mockResolvedValue([{ id: 'd1', public_key: 'k1' }]);

      await syncDevicesWithAPI({ extensionID: 'ext-fresh', devices: [] }, { fresh: true });
      await syncDevicesWithAPI({ extensionID: 'ext-fresh', devices: [] }, { fresh: true });

      expect(getAllPairedDevices).toHaveBeenCalledTimes(2);
    });

    it('reflects an unpaired device immediately with fresh (no stale cache accept)', async () => {
      // First: device present. Warm the throttle cache with a non-fresh call.
      getAllPairedDevices.mockResolvedValueOnce([{ id: 'd1', public_key: 'k1' }]);
      await syncDevicesWithAPI({ extensionID: 'ext-unpair', devices: [] });

      // Device just got unpaired server-side. A fresh check must see the empty list
      // even though the throttle window has not elapsed.
      getAllPairedDevices.mockResolvedValueOnce([]);
      const res = await syncDevicesWithAPI({ extensionID: 'ext-unpair', devices: [{ device_id: 'd1', device_public_key: 'k1' }] }, { fresh: true });

      expect(res.storage.devices).toEqual([]);
    });
  });
  describe('request blocked by the browser (no host access, CORS)', () => {
    const loadFailed = () => ({ name: 'TypeError', message: 'Load failed' });

    // The plain GET /health answers; the one carrying our headers dies in the
    // browser, the way a rejected CORS preflight does.
    const stubCorsBlock = () => vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      if (init.headers) {
        throw new TypeError('Load failed');
      }

      return new Response('{}', { status: 200 });
    }));

    const blockedLogs = () => vi.mocked(storeLog).mock.calls.filter(([level, id]) => level === 'warning' && id === 76);

    beforeEach(() => {
      vi.mocked(storeLog).mockClear();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('flags blocked when the browser refuses the request', async () => {
      getAllPairedDevices.mockRejectedValue(loadFailed());
      vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      const res = await syncDevicesWithAPI({ extensionID: 'ext-blocked', devices: [] }, { fresh: true });

      expect(res.apiError).toBe(true);
      expect(res.blocked).toBe(true);
    });

    it('does not flag blocked for a network failure while host access is granted', async () => {
      getAllPairedDevices.mockRejectedValue(loadFailed());

      const res = await syncDevicesWithAPI({ extensionID: 'ext-net', devices: [] }, { fresh: true });

      expect(res.apiError).toBe(true);
      expect(res.blocked).toBe(false);
    });

    it('skips the diagnosis when the caller does not need it', async () => {
      // isDevicePaired gates a token the user is waiting for: no extra probes there.
      getAllPairedDevices.mockRejectedValue(loadFailed());
      const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      const res = await syncDevicesWithAPI({ extensionID: 'ext-nodiag', devices: [] }, { fresh: true, diagnose: false });

      expect(res.blocked).toBe(false);
      expect(contains).not.toHaveBeenCalled();
    });

    it('holds log 76 while the block lasts: store_log goes through the same blocked API', async () => {
      getAllPairedDevices.mockRejectedValue(loadFailed());
      vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      await syncDevicesWithAPI({ extensionID: 'ext-hold', devices: [] }, { fresh: true });
      await syncDevicesWithAPI({ extensionID: 'ext-hold', devices: [] }, { fresh: true });

      expect(blockedLogs().length).toBe(0);
    });

    it('reports log 76 on the first sync that succeeds after the block', async () => {
      getAllPairedDevices.mockRejectedValue(loadFailed());
      vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      await syncDevicesWithAPI({ extensionID: 'ext-after', devices: [] }, { fresh: true });

      getAllPairedDevices.mockResolvedValue([]);
      await syncDevicesWithAPI({ extensionID: 'ext-after', devices: [] }, { fresh: true });

      await vi.waitFor(() => expect(blockedLogs().length).toBe(1));
    });

    it('reports one 76 per browser session, even when the block comes back', async () => {
      const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      getAllPairedDevices.mockRejectedValue(loadFailed());
      await syncDevicesWithAPI({ extensionID: 'ext-session', devices: [] }, { fresh: true });
      getAllPairedDevices.mockResolvedValue([]);
      await syncDevicesWithAPI({ extensionID: 'ext-session', devices: [] }, { fresh: true });
      await vi.waitFor(() => expect(blockedLogs().length).toBe(1));

      // Second episode in the same session: nothing is held for it.
      getAllPairedDevices.mockRejectedValue(loadFailed());
      const again = await syncDevicesWithAPI({ extensionID: 'ext-session', devices: [] }, { fresh: true });
      const held = await browser.storage.session.get('apiAccessBlockedPending');

      expect(again.blocked).toBe(true);
      expect(held.apiAccessBlockedPending === undefined).toBe(true);
      expect(contains).toHaveBeenCalled();
    });

    it('sends a typed, key-free 76: constant message and the cause fields only', async () => {
      getAllPairedDevices.mockRejectedValue(loadFailed());
      vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      await syncDevicesWithAPI({ extensionID: 'ext-payload', devices: [] }, { fresh: true });
      getAllPairedDevices.mockResolvedValue([]);
      await syncDevicesWithAPI({ extensionID: 'ext-payload', devices: [] }, { fresh: true });
      await vi.waitFor(() => expect(blockedLogs().length).toBe(1));

      const [, , err, context] = blockedLogs()[0];

      expect(err.message).toBe('API requests were blocked by the browser: no host access, API reachable');
      expect(Object.keys(err.cause).sort()).toEqual(['blockedForMinutes', 'errorName', 'hostAccessNow']);
      expect(typeof err.cause.errorName).toBe('string');
      expect(typeof err.cause.blockedForMinutes).toBe('number');
      expect(err.cause.hostAccessNow).toBe(false);
      expect(context).toBe('syncDevicesWithAPI');
    });

    it('keeps the sync result when storage.session fails', async () => {
      vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('session unavailable'));
      vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();

      getAllPairedDevices.mockRejectedValue(loadFailed());
      const blocked = await syncDevicesWithAPI({ extensionID: 'ext-session-fail', devices: [] }, { fresh: true });

      getAllPairedDevices.mockResolvedValue([{ id: 'd1', public_key: 'k1' }]);
      const recovered = await syncDevicesWithAPI({ extensionID: 'ext-session-fail', devices: [] }, { fresh: true });

      expect(blocked.blocked).toBe(true);
      expect(recovered.apiError).toBe(false);
      expect(recovered.hasDevices).toBe(true);
    });

    it('does not hold up the caller while log 76 goes out', async () => {
      // The first success after a block may be the token-delivery check.
      getAllPairedDevices.mockRejectedValue(loadFailed());
      vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
      stubCorsBlock();
      await syncDevicesWithAPI({ extensionID: 'ext-nowait', devices: [] }, { fresh: true });

      let releaseLog;
      vi.mocked(storeLog).mockImplementationOnce(() => new Promise(resolve => { releaseLog = resolve; }));
      getAllPairedDevices.mockResolvedValue([]);

      const res = await syncDevicesWithAPI({ extensionID: 'ext-nowait', devices: [] }, { fresh: true, diagnose: false });

      expect(res.apiError).toBe(false);
      await vi.waitFor(() => expect(typeof releaseLog).toBe('function'));
      releaseLog();
    });

    it('reports nothing when no block happened', async () => {
      getAllPairedDevices.mockRejectedValue(loadFailed());
      await syncDevicesWithAPI({ extensionID: 'ext-net-log', devices: [] }, { fresh: true });

      getAllPairedDevices.mockResolvedValue([]);
      await syncDevicesWithAPI({ extensionID: 'ext-net-log', devices: [] }, { fresh: true });

      expect(vi.mocked(storeLog).mock.calls.some(([, id]) => id === 76)).toBe(false);
    });
  });
});
