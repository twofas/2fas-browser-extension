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

import { describe, it, expect, vi } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/update/enqueueBrowserRegistration.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@sdk/index.js', () => ({
  default: class {
    createExtensionInstance () {
      return Promise.resolve({ id: 'ext-123' });
    }
  }
}));

import generateDefaultStorage from './generateDefaultStorage.js';
import { getPrivateKey } from './privateKeyStore.js';
import { loadFromLocalStorage } from '@localStorage/index.js';
import Crypt from './Crypt.js';

const BROWSER_INFO = { name: 'Chrome', browser_name: 'Chrome', browser_version: '120' };

describe('generateDefaultStorage', () => {
  it('stores the private key in IndexedDB and never as plaintext in storage.local', async () => {
    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(['keys', 'extensionID']);

    expect(storage.extensionID).toBe('ext-123');
    expect(storage.keys.publicKey).toBeTruthy();
    expect(storage.keys.privateKey).toBeUndefined();
    expect(await getPrivateKey()).toBeDefined();
  });

  it('produces a consistent pair: the stored public key encrypts what the IndexedDB private key decrypts', async () => {
    await generateDefaultStorage(BROWSER_INFO);

    const { keys } = await loadFromLocalStorage(['keys']);
    const crypt = new Crypt();
    const publicKey = await crypt.importKey(crypt.stringToArrayBuffer(keys.publicKey), 'spki', ['encrypt']);
    const ciphertext = await crypt.encrypt(publicKey, crypt.encodeText('987654'));

    const privateKey = await getPrivateKey();

    expect(crypt.decodeText(await crypt.decrypt(privateKey, ciphertext))).toBe('987654');
  });
});
