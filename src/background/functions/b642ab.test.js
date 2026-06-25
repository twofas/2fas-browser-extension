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
import b642ab from './b642ab.js';
import ab2b64 from './ab2b64.js';

describe('b642ab', () => {
  it('decodes a base64 string to an ArrayBuffer with the expected bytes', () => {
    // 'aGVsbG8=' is base64 for "hello"
    const buffer = b642ab('aGVsbG8=');

    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(buffer))).toEqual([104, 101, 108, 108, 111]);
  });

  it('decodes the empty string to an empty buffer', () => {
    expect(new Uint8Array(b642ab('')).length).toBe(0);
  });

  it('throws a TypeError for non-string input', () => {
    expect(() => b642ab(null)).toThrow(TypeError);
    expect(() => b642ab(undefined)).toThrow('Expected input to be a string');
    expect(() => b642ab(123)).toThrow('Expected input to be a string');
    expect(() => b642ab(new ArrayBuffer(4))).toThrow(TypeError);
  });
});

describe('ab2b64 <-> b642ab roundtrip', () => {
  it('preserves arbitrary byte sequences (ArrayBuffer -> base64 -> ArrayBuffer)', () => {
    const original = Uint8Array.from([0, 1, 2, 127, 128, 200, 254, 255]);

    const restored = new Uint8Array(b642ab(ab2b64(original.buffer)));

    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('preserves a canonical base64 string (base64 -> ArrayBuffer -> base64)', () => {
    const base64 = 'aGVsbG8gd29ybGQ='; // "hello world"

    expect(ab2b64(b642ab(base64))).toBe(base64);
  });

  it('roundtrips all 256 byte values', () => {
    const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);

    const restored = new Uint8Array(b642ab(ab2b64(allBytes.buffer)));

    expect(Array.from(restored)).toEqual(Array.from(allBytes));
  });
});
