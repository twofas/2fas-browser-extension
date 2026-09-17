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

/* global crypto, Buffer */
import { describe, it, expect } from 'vitest';
import recoverSigningPublicKey from './recoverSigningPublicKey.js';
import { importSigningKey } from './signingKeyStore.js';

// Every key is generated at runtime; keys are only ever compared inside a
// boolean, never printed.
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const spkiOf = async publicKey => Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64');

describe('recoverSigningPublicKey', () => {
  it('recovers the standard-base64 SPKI of the public half from signatures alone (8 random pairs)', async () => {
    for (let i = 0; i < 8; i++) {
      const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);

      const recovered = await recoverSigningPublicKey(pair.privateKey);

      expect(recovered === await spkiOf(pair.publicKey)).toBe(true);
    }
  });

  it('works on a non-extractable private key (the IndexedDB tier)', async () => {
    const pair = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);

    expect((await recoverSigningPublicKey(pair.privateKey)) === await spkiOf(pair.publicKey)).toBe(true);
  });

  it('works on a pkcs8 copy imported non-extractable (the storage.local tier)', async () => {
    const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    const imported = await importSigningKey(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

    expect(imported.extractable).toBe(false);
    expect((await recoverSigningPublicKey(imported)) === await spkiOf(pair.publicKey)).toBe(true);
  });

  it('the recovered key verifies a fresh signature by the private key (WebCrypto is the judge)', async () => {
    const pair = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
    const recovered = await recoverSigningPublicKey(pair.privateKey);
    const publicKey = await crypto.subtle.importKey('spki', Buffer.from(recovered, 'base64'), ECDSA, false, ['verify']);
    const message = new TextEncoder().encode('anything');
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, message);

    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, publicKey, signature, message)).toBe(true);
  });

  it('rejects for a key that cannot sign ECDSA P-256 (never guesses)', async () => {
    const rsa = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      false,
      ['encrypt', 'decrypt']
    );

    await expect(recoverSigningPublicKey(rsa.privateKey)).rejects.toBeTruthy();
  });
});
