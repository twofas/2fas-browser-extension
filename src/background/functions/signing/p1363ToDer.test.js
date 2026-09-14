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
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from 'node:crypto';

import p1363ToDer from './p1363ToDer.js';

describe('p1363ToDer — crafted vectors', () => {
  it('strips leading zero octets to a minimal INTEGER', () => {
    const r = new Uint8Array(32);
    r[31] = 0x01; // r = 1
    const s = new Uint8Array(32);
    s[31] = 0x02; // s = 2

    const der = p1363ToDer(new Uint8Array([...r, ...s]));

    expect(Array.from(der)).toEqual([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);
  });

  it('prefixes 0x00 when the top bit is set (keeps INTEGER positive)', () => {
    const r = new Uint8Array(32).fill(0xff); // high bit set, full length
    const s = new Uint8Array(32);
    s[0] = 0x80; // high bit set after no stripping

    const der = p1363ToDer(new Uint8Array([...r, ...s]));

    // r: 02 21 00 ff*32 ; s: 02 21 00 80 00*31
    expect(der[0]).toBe(0x30);
    expect(der[1]).toBe(0x23 + 0x23); // 2 + 33 bytes per INTEGER content+header = 35 each
    expect(Array.from(der.slice(2, 5))).toEqual([0x02, 0x21, 0x00]);
    expect(Array.from(der.slice(5, 37))).toEqual(Array(32).fill(0xff));
    expect(Array.from(der.slice(37, 40))).toEqual([0x02, 0x21, 0x00]);
    expect(der[40]).toBe(0x80);
  });

  it('encodes an all-zero component as INTEGER 0', () => {
    const zero = new Uint8Array(64);

    const der = p1363ToDer(zero);

    expect(Array.from(der)).toEqual([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x00]);
  });

  it('rejects odd-length input', () => {
    expect(() => p1363ToDer(new Uint8Array(63))).toThrow(TypeError);
    expect(() => p1363ToDer(new Uint8Array(0))).toThrow(TypeError);
  });
});

describe('p1363ToDer — round-trip against node:crypto', () => {
  it('converted signatures verify as DER for many random signatures', () => {
    // 200 random signatures statistically cover the edge encodings (leading
    // zero bytes ~1/256 per byte, high bit ~1/2) that make DER conversion
    // subtle. node:crypto signs in ieee-p1363 and verifies in (default) DER.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

    for (let i = 0; i < 200; i++) {
      const message = Buffer.from(`message-${i}`);
      const raw = nodeSign('sha256', message, { key: privateKey, dsaEncoding: 'ieee-p1363' });

      expect(raw.length).toBe(64);

      const der = Buffer.from(p1363ToDer(new Uint8Array(raw)));

      expect(nodeVerify('sha256', message, publicKey, der)).toBe(true);
    }
  });
});
