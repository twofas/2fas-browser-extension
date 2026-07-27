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
vi.mock('@/defaultAutoSubmitExcludedDomains.js', () => ({ default: ['default-a.com', 'default-b.com'] }));

import handleUpdateList from './updateListAction.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

describe('handleUpdateList', () => {
  describe('domains', () => {
    it('adds a new domain and reports added:true', async () => {
      const res = await handleUpdateList({ list: 'domains', op: 'add', value: 'x.com' });

      expect(res).toMatchObject({ list: 'domains', added: true });
      expect(res.result).toContain('x.com');

      const stored = await loadFromLocalStorage(['autoSubmitExcludedDomains']);
      expect(stored.autoSubmitExcludedDomains).toEqual(['x.com']);
    });

    it('does not duplicate an existing domain and reports added:false', async () => {
      await saveToLocalStorage({ autoSubmitExcludedDomains: ['x.com'] });

      const res = await handleUpdateList({ list: 'domains', op: 'add', value: 'x.com' });

      expect(res.added).toBe(false);
      expect(res.result).toEqual(['x.com']);
    });

    it('removes a domain', async () => {
      await saveToLocalStorage({ autoSubmitExcludedDomains: ['x.com', 'y.com'] });

      const res = await handleUpdateList({ list: 'domains', op: 'remove', value: 'x.com' });

      expect(res.result).toEqual(['y.com']);

      const stored = await loadFromLocalStorage(['autoSubmitExcludedDomains']);
      expect(stored.autoSubmitExcludedDomains).toEqual(['y.com']);
    });

    it('imports the default domains, merged uniquely with the current list', async () => {
      await saveToLocalStorage({ autoSubmitExcludedDomains: ['default-a.com', 'keep.com'] });

      const res = await handleUpdateList({ list: 'domains', op: 'importDefaults' });

      expect(res.result).toEqual(['default-a.com', 'keep.com', 'default-b.com']);
    });

    it('rejects an add with a missing value', async () => {
      await expect(handleUpdateList({ list: 'domains', op: 'add' })).rejects.toThrow();
    });
  });

  describe('devices', () => {
    it('removes a device and keeps configured=true while others remain', async () => {
      await saveToLocalStorage({
        devices: [{ device_id: 'd1', device_public_key: 'k1' }, { device_id: 'd2', device_public_key: 'k2' }],
        configured: true
      });

      const res = await handleUpdateList({ list: 'devices', op: 'remove', deviceId: 'd1' });

      expect(res.result).toEqual([{ device_id: 'd2', device_public_key: 'k2' }]);

      const stored = await loadFromLocalStorage(['devices', 'configured']);
      expect(stored.configured).toBe(true);
    });

    it('sets configured=false when the last device is removed', async () => {
      await saveToLocalStorage({
        devices: [{ device_id: 'd1', device_public_key: 'k1' }],
        configured: true
      });

      await handleUpdateList({ list: 'devices', op: 'remove', deviceId: 'd1' });

      const stored = await loadFromLocalStorage(['devices', 'configured']);
      expect(stored.devices).toEqual([]);
      expect(stored.configured).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects an unknown list', async () => {
      await expect(handleUpdateList({ list: 'bogus', op: 'add', value: 'x' })).rejects.toThrow();
    });

    it('rejects an unknown op', async () => {
      await expect(handleUpdateList({ list: 'domains', op: 'frobnicate' })).rejects.toThrow();
    });
  });
});
