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
import uniqueOnly from './uniqueOnly.js';

describe('uniqueOnly', () => {
  it('removes duplicate values, keeping first occurrence order', () => {
    expect([1, 1, 2, 3, 3, 3, 4].filter(uniqueOnly)).toEqual([1, 2, 3, 4]);
  });

  it('deduplicates strings', () => {
    expect(['a', 'b', 'a', 'c', 'b'].filter(uniqueOnly)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op on an already-unique array', () => {
    expect([1, 2, 3].filter(uniqueOnly)).toEqual([1, 2, 3]);
  });

  it('returns an empty array for an empty array', () => {
    expect([].filter(uniqueOnly)).toEqual([]);
  });

  it('compares with strict equality (does not coerce 1 and "1")', () => {
    expect([1, '1', 1, '1'].filter(uniqueOnly)).toEqual([1, '1']);
  });

  it('keeps only the first of repeated NaN-free falsy values', () => {
    expect([0, false, 0, false, null, null].filter(uniqueOnly)).toEqual([0, false, null]);
  });
});
