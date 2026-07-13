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

const syncDevicesWithAPI = vi.fn();
vi.mock('@background/functions/syncDevicesWithAPI.js', () => ({ default: (...a) => syncDevicesWithAPI(...a) }));

import isDevicePaired from './isDevicePaired.js';

beforeEach(() => {
  syncDevicesWithAPI.mockReset();
});

describe('isDevicePaired', () => {
  it('requests a fresh (throttle-bypassing) sync of the caller storage', async () => {
    syncDevicesWithAPI.mockResolvedValue({ storage: { devices: [] } });
    const storage = { devices: [] };

    await isDevicePaired(storage, 'dev-1');

    expect(syncDevicesWithAPI).toHaveBeenCalledWith(storage, { fresh: true });
  });

  it('is true when the synced device list contains the device', async () => {
    syncDevicesWithAPI.mockResolvedValue({ storage: { devices: [{ device_id: 'dev-2' }, { device_id: 'dev-1' }] } });
    expect(await isDevicePaired({}, 'dev-1')).toBe(true);
  });

  it('is false when the device is not in the synced list', async () => {
    syncDevicesWithAPI.mockResolvedValue({ storage: { devices: [{ device_id: 'other' }] } });
    expect(await isDevicePaired({}, 'dev-1')).toBe(false);
  });

  it('is false when the synced storage has no devices', async () => {
    syncDevicesWithAPI.mockResolvedValue({ storage: {} });
    expect(await isDevicePaired({}, 'dev-1')).toBe(false);
  });

  it('falls back to the cached list on API failure (sync returns the caller storage unchanged)', async () => {
    // On any API failure syncDevicesWithAPI fails open, returning the caller storage
    // unchanged — the check then relies on the locally cached device list.
    const cachedStorage = { devices: [{ device_id: 'dev-1' }] };
    syncDevicesWithAPI.mockResolvedValue({ storage: cachedStorage });
    expect(await isDevicePaired(cachedStorage, 'dev-1')).toBe(true);
  });
});
