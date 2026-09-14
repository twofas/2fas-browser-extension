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
import classifyKeyMaterial, {
  missingKeyName,
  KEY_MATERIAL_VALID,
  KEY_MATERIAL_MISSING_PRIVATE_KEY,
  KEY_MATERIAL_MISSING_SIGNING_KEY
} from './keyMaterialState.js';
import { savePrivateKey } from './privateKeyStore.js';
import { saveSigningKey } from './signing/signingKeyStore.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

const withRsaKey = async () => {
  const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
  await savePrivateKey(pair.privateKey);
};

const withSigningKey = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  await saveSigningKey(pair.privateKey);
};

describe('classifyKeyMaterial', () => {
  it('is valid with the RSA key while signing is not active (signing key minted on demand)', async () => {
    await withRsaKey();

    expect(await classifyKeyMaterial({ keys: { publicKey: 'pub' }, signing: { active: false } })).toBe(KEY_MATERIAL_VALID);
    expect(await classifyKeyMaterial({ keys: { publicKey: 'pub' } })).toBe(KEY_MATERIAL_VALID);
  });

  it('reports the RSA key first when it is gone, whatever the signing state', async () => {
    expect(await classifyKeyMaterial({ keys: { publicKey: 'pub' }, signing: { active: true } })).toBe(KEY_MATERIAL_MISSING_PRIVATE_KEY);
    expect(missingKeyName(KEY_MATERIAL_MISSING_PRIVATE_KEY)).toBe('rsa');
  });

  it('reports a missing signing key only while signing is active', async () => {
    await withRsaKey();

    expect(await classifyKeyMaterial({ keys: { publicKey: 'pub' }, signing: { active: true } })).toBe(KEY_MATERIAL_MISSING_SIGNING_KEY);
    expect(missingKeyName(KEY_MATERIAL_MISSING_SIGNING_KEY)).toBe('signing');
  });

  it('is valid with both keys while signing is active', async () => {
    await withRsaKey();
    await withSigningKey();

    expect(await classifyKeyMaterial({ keys: { publicKey: 'pub' }, signing: { active: true } })).toBe(KEY_MATERIAL_VALID);
  });

  it('propagates an IndexedDB failure instead of reporting a missing key', async () => {
    globalThis.indexedDB = { open: () => { throw new Error('IndexedDB unavailable'); } };

    await expect(classifyKeyMaterial({ keys: { publicKey: 'pub' } })).rejects.toThrow('IndexedDB unavailable');
  });
});
