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

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const enqueueBrowserRegistration = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/update/enqueueBrowserRegistration.js', () => ({ default: (...a) => enqueueBrowserRegistration(...a) }));

// Simulate the private-key store (IndexedDB) being ENTIRELY unavailable: every op
// that opens the DB rejects — both delete (which runs first) and save.
const savePrivateKey = vi.fn().mockRejectedValue(new Error('IDB open failed'));
const deletePrivateKey = vi.fn().mockRejectedValue(new Error('IDB open failed'));
vi.mock('@background/functions/privateKeyStore.js', () => ({
  savePrivateKey: (...a) => savePrivateKey(...a),
  deletePrivateKey: (...a) => deletePrivateKey(...a),
  getPrivateKey: vi.fn().mockResolvedValue(undefined),
  getOrMigratePrivateKey: vi.fn().mockResolvedValue(null)
}));

vi.mock('@sdk/index.js', () => ({
  default: class {
    createExtensionInstance () {
      return Promise.resolve({ id: 'ext-123' });
    }
  }
}));

import generateDefaultStorage from './generateDefaultStorage.js';

const BROWSER_INFO = { name: 'Chrome', browser_name: 'Chrome', browser_version: '120' };

describe('generateDefaultStorage — IndexedDB unavailable (Z3)', () => {
  it('classifies an IndexedDB failure as retryable (warning) even when the FIRST op (deletePrivateKey) fails', async () => {
    await generateDefaultStorage(BROWSER_INFO);

    // deletePrivateKey fails first (before generateKeys/savePrivateKey ever run);
    // it must still be tagged so this is a retryable 'warning' 28, NOT terminal 'error' 28.
    expect(deletePrivateKey).toHaveBeenCalledTimes(1);
    expect(savePrivateKey).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('warning', 28, expect.any(Error), expect.stringContaining('IndexedDB unavailable'));
    expect(storeLog).not.toHaveBeenCalledWith('error', 28, expect.anything(), expect.anything());

    const call = storeLog.mock.calls.find(c => c[0] === 'warning' && c[1] === 28);
    expect(call[2].isIndexedDBError).toBe(true);
  });
});
