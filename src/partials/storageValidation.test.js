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

vi.mock('@notification/index.js', () => ({
  default: { show: vi.fn(), showWithoutTimeout: vi.fn() }
}));

import storageValidation from './storageValidation.js';

describe('storageValidation', () => {
  it('accepts storage with a public key + extension ID even without a private key in storage.local', async () => {
    // This is the migrated shape: the private key now lives in IndexedDB.
    await expect(storageValidation({ keys: { publicKey: 'pub' }, extensionID: 'id' })).resolves.toBeUndefined();
  });

  it('rejects storage missing the public key', async () => {
    await expect(storageValidation({ keys: {}, extensionID: 'id' })).rejects.toThrow('Storage corrupted');
  });

  it('rejects storage missing the extension ID', async () => {
    await expect(storageValidation({ keys: { publicKey: 'pub' } })).rejects.toThrow('Storage corrupted');
  });

  it('throws "Too many attempts" once the attempt counter exceeds 5', async () => {
    await expect(storageValidation({ keys: {}, attempt: 6 })).rejects.toThrow('Too many attempts');
  });
});
