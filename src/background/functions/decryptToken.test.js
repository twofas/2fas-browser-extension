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

const stringToArrayBuffer = vi.fn(() => new ArrayBuffer(8));
const decrypt = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
const decodeText = vi.fn(() => 'PLAINTEXT');

vi.mock('@background/functions/Crypt.js', () => ({
  default: class {
    stringToArrayBuffer (...a) { return stringToArrayBuffer(...a); }
    decrypt (...a) { return decrypt(...a); }
    decodeText (...a) { return decodeText(...a); }
  }
}));

import decryptToken from './decryptToken.js';

beforeEach(() => {
  stringToArrayBuffer.mockClear();
  decrypt.mockClear();
  decodeText.mockClear();
});

describe('decryptToken', () => {
  it('converts the token to a buffer, decrypts it with the private key, and returns the decoded text', async () => {
    const privateKey = { fake: 'key' };
    const buffer = new ArrayBuffer(8);
    stringToArrayBuffer.mockReturnValueOnce(buffer);

    const result = await decryptToken('encrypted-token', privateKey);

    expect(stringToArrayBuffer).toHaveBeenCalledWith('encrypted-token');
    expect(decrypt).toHaveBeenCalledWith(privateKey, buffer);
    expect(result).toBe('PLAINTEXT');
  });
});
