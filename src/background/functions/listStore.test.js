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

import { describe, it, expect, vi } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import { mutateList, mutateDevices, mutateExcludedDomains } from './listStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import browser from 'webextension-polyfill';

describe('listStore', () => {
  describe('mutateList', () => {
    it('applies the reducer to the current array and persists the result', async () => {
      await saveToLocalStorage({ autoSubmitExcludedDomains: ['a.com'] });

      const next = await mutateList('autoSubmitExcludedDomains', list => [...list, 'b.com']);

      expect(next).toEqual(['a.com', 'b.com']);

      const stored = await loadFromLocalStorage(['autoSubmitExcludedDomains']);
      expect(stored.autoSubmitExcludedDomains).toEqual(['a.com', 'b.com']);
    });

    it('passes an empty array to the reducer when the key is missing or not an array', async () => {
      const reducer = vi.fn(list => list);

      await mutateList('autoSubmitExcludedDomains', reducer);
      expect(reducer).toHaveBeenCalledWith([]);

      await saveToLocalStorage({ autoSubmitExcludedDomains: 'oops-not-array' });
      reducer.mockClear();

      await mutateList('autoSubmitExcludedDomains', reducer);
      expect(reducer).toHaveBeenCalledWith([]);
    });

    it('serializes concurrent mutations of the same key so no write is lost', async () => {
      await Promise.all([
        mutateExcludedDomains(list => [...list, 'a.com']),
        mutateExcludedDomains(list => [...list, 'b.com'])
      ]);

      const stored = await loadFromLocalStorage(['autoSubmitExcludedDomains']);
      expect(stored.autoSubmitExcludedDomains).toHaveLength(2);
      expect(stored.autoSubmitExcludedDomains).toEqual(expect.arrayContaining(['a.com', 'b.com']));
    });

    it('skips the write and returns the current value when the reducer signals no change (null)', async () => {
      await saveToLocalStorage({ autoSubmitExcludedDomains: ['a.com'] });
      const setSpy = vi.spyOn(browser.storage.local, 'set');

      const result = await mutateList('autoSubmitExcludedDomains', () => null);

      expect(result).toEqual(['a.com']);
      expect(setSpy).not.toHaveBeenCalled();

      setSpy.mockRestore();
    });

    it('does not wedge the queue when a reducer rejects', async () => {
      await expect(
        mutateExcludedDomains(() => { throw new Error('boom'); })
      ).rejects.toThrow('boom');

      const next = await mutateExcludedDomains(list => [...list, 'after.com']);
      expect(next).toEqual(['after.com']);
    });
  });

  describe('mutateDevices', () => {
    it('derives configured=true when devices remain and false when the list empties', async () => {
      await mutateDevices(() => [{ device_id: 'd1', device_public_key: 'k1' }]);

      let stored = await loadFromLocalStorage(['devices', 'configured']);
      expect(stored.devices).toHaveLength(1);
      expect(stored.configured).toBe(true);

      await mutateDevices(devices => devices.filter(d => d.device_id !== 'd1'));

      stored = await loadFromLocalStorage(['devices', 'configured']);
      expect(stored.devices).toEqual([]);
      expect(stored.configured).toBe(false);
    });
  });
});
