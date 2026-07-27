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

import { describe, it, expect } from 'vitest';
import reconcileDevices from './reconcileDevices.js';

const local = (...ids) => ids.map(id => ({ device_id: id, device_public_key: `key-${id}` }));
const api = (...ids) => ids.map(id => ({ id, public_key: `key-${id}`, name: id }));

describe('reconcileDevices', () => {
  it('returns null (no change) when the API and local are both empty', () => {
    expect(reconcileDevices([], [])).toBeNull();
  });

  it('clears local devices when the API reports none', () => {
    expect(reconcileDevices(local('d1', 'd2'), [])).toEqual([]);
  });

  it('returns null (no change) when the API exactly matches local', () => {
    expect(reconcileDevices(local('d1', 'd2'), api('d1', 'd2'))).toBeNull();
  });

  it('adds a new API device, mapping id/public_key to the local shape', () => {
    expect(reconcileDevices(local('d1'), api('d1', 'd2'))).toEqual([
      { device_id: 'd1', device_public_key: 'key-d1' },
      { device_id: 'd2', device_public_key: 'key-d2' }
    ]);
  });

  it('removes a local device the API no longer lists', () => {
    expect(reconcileDevices(local('d1', 'd2'), api('d1'))).toEqual([
      { device_id: 'd1', device_public_key: 'key-d1' }
    ]);
  });

  it('skips a new API device that has no public_key', () => {
    const apiDevices = [{ id: 'd2', public_key: '' }];
    // d2 would be the only candidate to add, but it has no key → no change.
    expect(reconcileDevices(local('d1'), [{ id: 'd1', public_key: 'key-d1' }, ...apiDevices])).toBeNull();
  });

  it('applies an add and a removal together', () => {
    expect(reconcileDevices(local('d1', 'd2'), api('d2', 'd3'))).toEqual([
      { device_id: 'd2', device_public_key: 'key-d2' },
      { device_id: 'd3', device_public_key: 'key-d3' }
    ]);
  });

  it('treats missing/undefined local devices as an empty list', () => {
    expect(reconcileDevices(undefined, api('d1'))).toEqual([
      { device_id: 'd1', device_public_key: 'key-d1' }
    ]);
  });
});
