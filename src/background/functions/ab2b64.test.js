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
import ab2b64 from './ab2b64.js';

describe('ab2b64', () => {
  it('encodes an ArrayBuffer to the expected base64 string', () => {
    const buffer = Uint8Array.from([104, 101, 108, 108, 111]).buffer; // "hello"

    expect(ab2b64(buffer)).toBe('aGVsbG8=');
  });

  it('encodes an empty buffer to an empty string', () => {
    expect(ab2b64(new ArrayBuffer(0))).toBe('');
  });

  it('produces correctly padded output for non-3-aligned lengths', () => {
    expect(ab2b64(Uint8Array.from([0]).buffer)).toBe('AA==');
    expect(ab2b64(Uint8Array.from([0, 0]).buffer)).toBe('AAA=');
    expect(ab2b64(Uint8Array.from([0, 0, 0]).buffer)).toBe('AAAA');
  });

  it('throws a TypeError when given a string instead of an ArrayBuffer', () => {
    expect(() => ab2b64('not a buffer')).toThrow(TypeError);
    expect(() => ab2b64('not a buffer')).toThrow('Expected input to be an ArrayBuffer');
  });
});
