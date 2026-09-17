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

import browser from 'webextension-polyfill';
import generateDefaultStorage from './generateDefaultStorage.js';
import { getPrivateKey } from './privateKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import Crypt from './Crypt.js';
import { CURRENT_SCHEMA_VERSION } from './storageMigrations.js';
import ensureUsableSigningKeyMaterial from './signing/ensureUsableSigningKeyMaterial.js';
import { getSigningKey, signingKeyPairMatches } from './signing/signingKeyStore.js';
import { installKeyConsoleTripwire, longestSurvivor } from '@test/helpers/keySinks.js';

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

  it('a create 400 echoing the sent keys logs 28 with the typed descriptor, key-free', async () => {
    createExtensionInstance.mockImplementation(async body => {
      const rejection = {
        status: 400,
        statusText: 'Bad Request',
        url: 'https://api.example.test/browser_extensions',
        signed: false,
        content: {
          Code: 400,
          Type: 'BadRequest',
          Description: 'Malformed request syntax.',
          Reason: `cannot register public_key "${body.public_key}" with public_signing_key "${body.public_signing_key}"`
        }
      };

      throw rejection;
    });

    await generateDefaultStorage(BROWSER_INFO);

    const { keys } = await loadFromLocalStorage(['keys']);
    const storeLog = (await import('@partials/storeLog.js')).default;
    const payloads = storeLog.mock.calls.filter(call => call[1] === 28).map(call => call[2]);

    expect(typeof keys?.publicKey === 'string' && typeof keys?.signingPublicKey === 'string').toBe(true);
    expect(payloads.length).toBe(1);

    const [payload] = payloads;
    const wire = JSON.stringify(payload);

    expect(longestSurvivor(wire, keys.publicKey)).toBe(0);
    expect(longestSurvivor(wire, keys.signingPublicKey)).toBe(0);
    expect(typeof payload.backend === 'object' && payload.backend !== null).toBe(true);
    expect('content' in payload).toBe(false);
    expect('url' in payload).toBe(false);
    expect(payload.backendStatus === 400 && payload.backendStatusText === 'Bad Request').toBe(true);
    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
  });

  it('a plain Error still reaches log 28 as the Error itself', async () => {
    const failure = new Error('crypto unavailable');
    generateKeyMaterial.mockRejectedValueOnce(failure);

    await generateDefaultStorage(BROWSER_INFO);

    const storeLog = (await import('@partials/storeLog.js')).default;
    const payloads = storeLog.mock.calls.filter(call => call[1] === 28).map(call => call[2]);

    expect(payloads.length).toBe(1);
    expect(payloads[0] === failure).toBe(true);
  });

  it('stamps the current storage schema version so fresh installs need no migration', async () => {
    await generateDefaultStorage(BROWSER_INFO);

    const storage = await loadFromLocalStorage(['storageSchemaVersion']);

    expect(storage.storageSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('a stale ensureUsable overlapping a reset leaves the new identity intact (M13)', async () => {
    createExtensionInstance.mockResolvedValue({ id: 'ext-2' });
    await saveToLocalStorage({ extensionID: 'ext-1', keys: { publicKey: 'rsa-1' } });

    const realGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    let ecdsaCalls = 0;
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey').mockImplementation(async (algorithm, ...rest) => {
      if (algorithm?.name === 'ECDSA' && ++ecdsaCalls === 1) {
        // The ensure has snapshotted the old identity. Let the reset clear storage
        // and re-arm its attempt counter before this key exists.
        await vi.waitFor(async () => {
          const storage = await loadFromLocalStorage(['attempt', 'keys']);

          if (!Number.isInteger(storage.attempt) || storage.keys !== undefined) {
            throw new Error('reset not yet cleared');
          }
        }, { timeout: 10000, interval: 5 });

        await new Promise(resolve => setTimeout(resolve, 0));

        // An unserialized reset is already generating its own keys: let it write
        // them first, which is the stale write-back ordering. A serialized one
        // cannot start while this call holds the key-material lock.
        if (generateKeyMaterial.mock.calls.length > 0) {
          await vi.waitFor(async () => {
            if ((await loadFromLocalStorage(['keys'])).keys === undefined) {
              throw new Error('reset keys not yet written');
            }
          }, { timeout: 10000, interval: 5 });
        }
      }

      return realGenerateKey(algorithm, ...rest);
    });
    let results;

    try {
      results = await Promise.allSettled([ensureUsableSigningKeyMaterial(), generateDefaultStorage(BROWSER_INFO)]);
    } finally {
      generateKey.mockRestore();
    }

    const after = await loadFromLocalStorage(['keys', 'extensionID']);

    expect(after.keys?.publicKey === 'rsa-1').toBe(false);
    expect(results.every(result => result.status === 'fulfilled')).toBe(true);
    expect(results[0].value?.persisted === false).toBe(true);
    expect(after.extensionID === 'ext-2').toBe(true);
    expect(await signingKeyPairMatches(after.keys?.signingPublicKey, await getSigningKey())).toBe(true);
  });

  it('writes a fresh key lineage in the keys set and counts its own POST as a send', async () => {
    let sendsAtPost = null;
    createExtensionInstance.mockImplementation(async () => {
      sendsAtPost = (await loadFromLocalStorage(['signingKeySends'])).signingKeySends;

      return { id: 'ext-123' };
    });

    const set = vi.spyOn(browser.storage.local, 'set');
    const before = Date.now();
    let keyWrites;

    try {
      // Lineage counters are identity, never carried over as preferences.
      await generateDefaultStorage(BROWSER_INFO, { signingKeyGenerations: 7, signingKeySends: 9, signingKeyGeneratedAt: 1 });
      keyWrites = set.mock.calls.map(call => call[0]).filter(arg => arg && typeof arg.keys === 'object');
    } finally {
      set.mockRestore();
    }

    expect(keyWrites.length).toBe(1);

    const [write] = keyWrites;
    expect(write.signingKeyGenerations).toBe(1);
    expect(write.signingKeySends).toBe(0);
    expect(typeof write.signingKeyGeneratedAt === 'number' && write.signingKeyGeneratedAt >= before && write.signingKeyGeneratedAt <= Date.now()).toBe(true);
    expect(sendsAtPost).toBe(1);

    const storage = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeySends', 'signingKeyGeneratedAt', 'extensionID']);
    expect(storage.signingKeyGenerations).toBe(1);
    expect(storage.signingKeySends).toBe(1);
    expect(storage.signingKeyGeneratedAt === write.signingKeyGeneratedAt).toBe(true);
    expect(storage.extensionID).toBe('ext-123');
  });

  it('a failing signingKeySends increment never blocks or fails the POST', async () => {
    const realSet = browser.storage.local.set;
    const set = vi.spyOn(browser.storage.local, 'set').mockImplementation(data => (
      data && 'signingKeySends' in data && !('keys' in data)
        ? Promise.reject(new Error('storage write failed'))
        : realSet(data)
    ));
    // saveToLocalStorage prints its failures; swallow them.
    const tripwire = installKeyConsoleTripwire();

    try {
      await generateDefaultStorage(BROWSER_INFO);
    } finally {
      tripwire.restore();
      set.mockRestore();
    }

    const storeLog = (await import('@partials/storeLog.js')).default;
    const storage = await loadFromLocalStorage(['extensionID', 'signingKeySends']);

    expect(createExtensionInstance.mock.calls.length).toBe(1);
    expect(storage.extensionID).toBe('ext-123');
    expect(storage.signingKeySends).toBe(0);
    expect(storeLog.mock.calls.filter(call => call[1] === 28).length).toBe(0);
    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
    expect(tripwire.hits).toBe(0);
  });
});
