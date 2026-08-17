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

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const enqueueBrowserRegistration = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/update/enqueueBrowserRegistration.js', () => ({ default: (...a) => enqueueBrowserRegistration(...a) }));

const savePrivateKey = vi.fn();
const deletePrivateKey = vi.fn();
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
import { loadFromLocalStorage } from '@localStorage/index.js';
import Crypt from './Crypt.js';

const BROWSER_INFO = { name: 'Chrome', browser_name: 'Chrome', browser_version: '120' };

// The exact rejection Firefox produces when IndexedDB is unavailable for
// extension pages (permanent private browsing / corrupted profile storage).
const IDB_ERR = new Error('A mutation operation was attempted on a database that did not allow mutations.');

beforeEach(() => {
  vi.clearAllMocks();
  savePrivateKey.mockResolvedValue(undefined);
  deletePrivateKey.mockResolvedValue(undefined);
});

describe('generateDefaultStorage — IndexedDB unavailable (Z3)', () => {
  it('completes registration with a storage.local fallback key when the FIRST op (deletePrivateKey) fails', async () => {
    deletePrivateKey.mockRejectedValue(IDB_ERR);
    savePrivateKey.mockRejectedValue(IDB_ERR);

    await generateDefaultStorage(BROWSER_INFO);

    // Registration went through — the extension is usable despite broken IndexedDB.
    const storage = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(storage.extensionID).toBe('ext-123');
    expect(typeof storage.keys.publicKey).toBe('string');
    expect(typeof storage.keys.privateKey).toBe('string');

    // The fallback key is real, importable pkcs8.
    const crypt = new Crypt();
    const imported = await crypt.importKey(crypt.stringToArrayBuffer(storage.keys.privateKey), 'pkcs8', ['decrypt']);
    expect(imported.type).toBe('private');

    // Surfaced once as a warning under its own ID — not the error-28 flood, and
    // not the old warning-28 retry loop that never converged.
    expect(storeLog).toHaveBeenCalledWith('warning', 60, expect.any(Error), expect.stringContaining('IndexedDB unavailable'));
    expect(storeLog).not.toHaveBeenCalledWith('error', 28, expect.anything(), expect.anything());
  });

  it('falls back when the delete succeeds but savePrivateKey fails', async () => {
    savePrivateKey.mockRejectedValue(IDB_ERR);

    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(storage.extensionID).toBe('ext-123');
    expect(typeof storage.keys.privateKey).toBe('string');
    expect(storeLog).toHaveBeenCalledWith('warning', 60, expect.any(Error), expect.stringContaining('IndexedDB unavailable'));
  });

  it('does NOT persist a private key in storage.local when IndexedDB works', async () => {
    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(storage.extensionID).toBe('ext-123');
    expect(typeof storage.keys.publicKey).toBe('string');
    expect(storage.keys.privateKey).toBeUndefined();
    expect(savePrivateKey).toHaveBeenCalledTimes(1);
    expect(storeLog).not.toHaveBeenCalled();
  });
});
