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

/* global crypto */
import { describe, it, expect } from 'vitest';
import Crypt from './Crypt.js';

describe('Crypt', () => {
  describe('generateKeys', () => {
    it('generates a non-extractable private key', async () => {
      const pair = await new Crypt().generateKeys();

      expect(pair.privateKey.extractable).toBe(false);
    });

    it('generates an extractable public key', async () => {
      const pair = await new Crypt().generateKeys();

      expect(pair.publicKey.extractable).toBe(true);
    });

    it('allows exporting the public key (spki) but never the private key (pkcs8)', async () => {
      const crypt = new Crypt();
      const pair = await crypt.generateKeys();

      const spki = await crypt.exportKey('spki', pair.publicKey);
      expect(spki.byteLength).toBeGreaterThan(0);

      await expect(crypt.exportKey('pkcs8', pair.privateKey)).rejects.toThrow();
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips a token through the generated key pair', async () => {
      const crypt = new Crypt();
      const pair = await crypt.generateKeys();

      const ciphertext = await crypt.encrypt(pair.publicKey, crypt.encodeText('123456'));
      const plaintext = await crypt.decrypt(pair.privateKey, ciphertext);

      expect(crypt.decodeText(plaintext)).toBe('123456');
    });
  });

  describe('importKey', () => {
    it('imports a pkcs8 key as non-extractable', async () => {
      const crypt = new Crypt();
      const extractablePair = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } },
        true,
        ['encrypt', 'decrypt']
      );
      const pkcs8 = await crypto.subtle.exportKey('pkcs8', extractablePair.privateKey);

      const imported = await crypt.importKey(pkcs8, 'pkcs8', ['decrypt']);

      expect(imported.extractable).toBe(false);
    });
  });
});
