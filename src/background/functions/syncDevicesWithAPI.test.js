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

const getAllPairedDevices = vi.fn();
vi.mock('@sdk/index.js', () => ({
  default: class {
    getAllPairedDevices (...args) {
      return getAllPairedDevices(...args);
    }
  }
}));

import syncDevicesWithAPI from './syncDevicesWithAPI.js';
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
});
