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
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/generateDefaultStorage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import verifyStorageIntegrity from './verifyStorageIntegrity.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import { savePrivateKey, getPrivateKey } from '@background/functions/privateKeyStore.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';
import Crypt from '@background/functions/Crypt.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyStorageIntegrity', () => {
  it('is valid without regenerating when public key + extension ID exist and the private key is in IndexedDB', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(true);
    expect(generateDefaultStorage).not.toHaveBeenCalled();
  });

  it('migrates a legacy plaintext key and stays valid without regenerating', async () => {
    const crypt = new Crypt();
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, true, ['encrypt', 'decrypt']);
    const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
    const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
    await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(true);
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(await getPrivateKey()).toBeDefined();
    const after = await loadFromLocalStorage(['keys']);
    expect(after.keys.privateKey).toBeUndefined();
  });

  it('regenerates default storage when storage is corrupt', async () => {
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
  });
});
