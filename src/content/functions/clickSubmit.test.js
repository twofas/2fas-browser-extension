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
import { findClosestIndex, extractHostname, isExcludedDomain } from './clickSubmit.js';

describe('clickSubmit/findClosestIndex', () => {
  it('returns -1 for an empty array', () => {
    expect(findClosestIndex([], 5)).toBe(-1);
  });

  it('returns 0 for a single-element array', () => {
    expect(findClosestIndex([42], 0)).toBe(0);
  });

  it('returns the index of the strictly closest value', () => {
    expect(findClosestIndex([10, 20, 30], 22)).toBe(1);
    expect(findClosestIndex([1, 5, 9], 4)).toBe(1);
  });

  it('returns the index of an exact match', () => {
    expect(findClosestIndex([3, 7, 11], 7)).toBe(1);
  });

  it('breaks ties toward the larger value', () => {
    // 4 and 6 are both distance 1 from 5; the larger (6, index 1) wins.
    expect(findClosestIndex([4, 6], 5)).toBe(1);
    // 5 and 9 are both distance 2 from 7; the larger (9, index 2) wins.
    expect(findClosestIndex([1, 5, 9], 7)).toBe(2);
  });

  it('returns the first index when values repeat', () => {
    expect(findClosestIndex([20, 20, 20], 20)).toBe(0);
  });
});

describe('clickSubmit/extractHostname', () => {
  it('returns the hostname for a plain https URL', () => {
    expect(extractHostname('https://example.com')).toBe('example.com');
  });

  it('strips a leading www. prefix', () => {
    expect(extractHostname('https://www.example.com/login?x=1')).toBe('example.com');
  });

  it('keeps subdomains other than www', () => {
    expect(extractHostname('http://sub.example.com')).toBe('sub.example.com');
    expect(extractHostname('https://www.sub.example.com')).toBe('sub.example.com');
  });

  it('does not strip a www-like prefix that is not exactly "www."', () => {
    expect(extractHostname('https://www2.example.com')).toBe('www2.example.com');
  });

  it('lowercases the host (per URL parsing)', () => {
    expect(extractHostname('https://WWW.Example.COM')).toBe('example.com');
  });

  it('returns null for an unparseable URL', () => {
    expect(extractHostname('not a url')).toBeNull();
    expect(extractHostname('')).toBeNull();
  });
});

describe('clickSubmit/isExcludedDomain', () => {
  it('returns true when the hostname is in the excluded list', () => {
    expect(isExcludedDomain(['example.com', 'foo.test'], 'example.com')).toBe(true);
  });

  it('returns false when the hostname is not excluded', () => {
    expect(isExcludedDomain(['example.com'], 'other.com')).toBe(false);
  });

  it('returns false for missing hostname or missing list', () => {
    expect(isExcludedDomain(['example.com'], null)).toBe(false);
    expect(isExcludedDomain(null, 'example.com')).toBe(false);
  });
});
