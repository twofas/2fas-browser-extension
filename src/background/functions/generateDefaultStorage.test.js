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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
const enqueueBrowserRegistration = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/update/enqueueBrowserRegistration.js', () => ({ default: (...a) => enqueueBrowserRegistration(...a) }));

const createExtensionInstance = vi.fn();
vi.mock('@sdk/index.js', () => ({
  default: class {
    createExtensionInstance (...args) {
      return createExtensionInstance(...args);
    }
  }
}));

const realGenerateKeyMaterial = await vi.importActual('./generateKeyMaterial.js');
const generateKeyMaterial = vi.fn((...a) => realGenerateKeyMaterial.default(...a));
vi.mock('./generateKeyMaterial.js', () => ({ default: (...a) => generateKeyMaterial(...a) }));

import generateDefaultStorage from './generateDefaultStorage.js';
import { getPrivateKey } from './privateKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import Crypt from './Crypt.js';
import { CURRENT_SCHEMA_VERSION } from './storageMigrations.js';

const BROWSER_INFO = { name: 'Chrome', browser_name: 'Chrome', browser_version: '120' };

beforeEach(async () => {
  enqueueBrowserRegistration.mockClear();
  createExtensionInstance.mockReset();
  createExtensionInstance.mockResolvedValue({ id: 'ext-123' });
  generateKeyMaterial.mockReset();
  generateKeyMaterial.mockImplementation((...a) => realGenerateKeyMaterial.default(...a));
  (await import('@partials/storeLog.js')).default.mockClear();
});

afterEach(() => {
  // Unstubbing inside a test body is lost when an assertion throws first, and a
  // leaked EXT_PLATFORM=Safari sends every later test down the storage.local path.
  vi.unstubAllEnvs();
});

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

  it('on Safari persists BOTH private keys as pkcs8 in storage.local, leaves IndexedDB empty and logs no fallback warning', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(storage.extensionID).toBe('ext-123');
    expect(typeof storage.keys.privateKey).toBe('string');
    expect(typeof storage.keys.signingPrivateKey).toBe('string');
    expect(await getPrivateKey()).toBeUndefined();

    // The stored copy is real, importable pkcs8 that pairs with the public key.
    const crypt = new Crypt();
    const imported = await crypt.importKey(crypt.stringToArrayBuffer(storage.keys.privateKey), 'pkcs8', ['decrypt']);
    expect(imported.type).toBe('private');
    expect(imported.extractable).toBe(false);

    const storeLog = (await import('@partials/storeLog.js')).default;
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('collapses concurrent calls into ONE generation + registration (onStartup / onInstalled / storageReset overlap)', async () => {
    await Promise.all([generateDefaultStorage(BROWSER_INFO), generateDefaultStorage(BROWSER_INFO)]);

    const storage = await loadFromLocalStorage(['keys', 'extensionID', 'attempt']);
    expect(storage.extensionID).toBe('ext-123');
    // One run: the attempt counter moved once, one IndexedDB key matches the one public key.
    expect(storage.attempt).toBe(1);
    expect(await getPrivateKey()).toBeTruthy();
  });

  it('writes caller overrides atomically with the defaults, identity fields always winning', async () => {
    await generateDefaultStorage(BROWSER_INFO, {
      logging: true,
      autoSubmitExcludedDomains: ['bank.test'],
      extIcon: 2,
      // Must not be able to smuggle identity/state through an override.
      configured: true,
      keys: { publicKey: 'forged' },
      extensionID: 'forged',
      attempt: 99
    });

    const storage = await loadFromLocalStorage(null);
    expect(storage.logging).toBe(true);
    expect(storage.autoSubmitExcludedDomains).toEqual(['bank.test']);
    expect(storage.extIcon).toBe(2);
    expect(storage.configured).toBe(false);
    expect(storage.keys.publicKey).not.toBe('forged');
    expect(storage.extensionID).toBe('ext-123');
    expect(storage.attempt).toBe(1);
  });

  it('drops non-preference overrides even when the registration never lands', async () => {
    // The old guard relied on the successful POST overwriting a smuggled extensionID.
    // With the POST failing, that safety net is gone: a leaked extensionID would pair
    // the OLD registration with the NEW keys, the catch below would skip the durable
    // create (it only enqueues when no extensionID is stored), and the install would
    // then classify as healthy while being unable to decrypt a single token.
    createExtensionInstance.mockRejectedValue(new Error('Failed to fetch'));

    await generateDefaultStorage(BROWSER_INFO, {
      logging: true,
      extensionID: 'forged',
      devices: [{ device_id: 'ghost' }],
      privateKeyMissingReported: true,
      pendingBrowserRegistration: { op: 'update' }
    });

    const storage = await loadFromLocalStorage(null);
    expect(storage.logging).toBe(true);
    expect(storage.extensionID).toBeUndefined();
    expect(storage.devices).toBeUndefined();
    expect(storage.privateKeyMissingReported).toBeUndefined();
    // The durable create owns the retry — it must see a keyed, unregistered install.
    expect(enqueueBrowserRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'create' })
    );
  });

  it('re-arms the attempt counter before the fallible work, so a failed reset stays bounded', async () => {
    // clearLocalStorage() drops `attempt` first. If key generation then throws, the
    // old code left storage at {} — and the pages' "attempt > 5" bound, the only
    // thing that stops a reset loop, restarted from zero every time.
    await saveToLocalStorage({ attempt: 4 });
    generateKeyMaterial.mockRejectedValueOnce(new Error('crypto unavailable'));

    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(null);
    expect(storage.attempt).toBe(5);
    expect(storage.keys).toBeUndefined();
  });

  it('stamps the current storage schema version so fresh installs need no migration', async () => {
    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(['storageSchemaVersion']);

    expect(storage.storageSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
