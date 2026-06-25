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
vi.mock('@notification/index.js', () => ({ default: { show: vi.fn() } }));

const configurationComplete = vi.fn();
vi.mock('@/installPage/functions/configurationComplete.js', () => ({ default: () => configurationComplete() }));

import handleConfigurationRequest from './handleConfigurationRequest.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import storeLog from '@partials/storeLog.js';

beforeEach(() => {
  configurationComplete.mockReset();
  storeLog.mockClear();
});

describe('handleConfigurationRequest', () => {
  it('adds a paired device to the cache, derives configured=true, and signals completion', async () => {
    await handleConfigurationRequest(1, { device_id: 'd1', device_public_key: 'k1' });

    const stored = await loadFromLocalStorage(['devices', 'configured']);
    expect(stored.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);
    expect(stored.configured).toBe(true);
    expect(configurationComplete).toHaveBeenCalled();
  });

  it('does not duplicate a device that is already paired', async () => {
    await saveToLocalStorage({ devices: [{ device_id: 'd1', device_public_key: 'k1' }], configured: true });

    await handleConfigurationRequest(1, { device_id: 'd1', device_public_key: 'k1' });

    const stored = await loadFromLocalStorage(['devices']);
    expect(stored.devices).toEqual([{ device_id: 'd1', device_public_key: 'k1' }]);
  });

  it('rejects invalid configuration data without writing devices', async () => {
    await handleConfigurationRequest(1, { device_id: 'd1' });

    const stored = await loadFromLocalStorage(['devices']);
    expect(stored.devices).toBeUndefined();
    expect(storeLog).toHaveBeenCalledWith('error', 7, expect.any(Error), 'configurationRequest');
    expect(configurationComplete).not.toHaveBeenCalled();
  });
});
