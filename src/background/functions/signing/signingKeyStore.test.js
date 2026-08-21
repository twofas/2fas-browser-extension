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

/* global crypto, TextEncoder */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import storeLog from '@partials/storeLog.js';
import {
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  saveSigningKey,
  getSigningKey
} from './signingKeyStore.js';
import ensureUsableSigningKeyMaterial from './ensureUsableSigningKeyMaterial.js';
import { savePrivateKey } from '@background/functions/privateKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const signSomething = key => crypto.subtle.sign(
  { name: 'ECDSA', hash: { name: 'SHA-256' } },
  key,
  new TextEncoder().encode('probe')
);

const makeLegacyPkcs8 = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);

  return Buffer.from(pkcs8).toString('base64');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateSigningKeyMaterial', () => {
  it('stores a non-extractable CryptoKey in IndexedDB and returns only the public key', async () => {
    const material = await generateSigningKeyMaterial();

    expect(material.signingPublicKey).toMatch(/^[A-Za-z0-9+/]+=*$/); // STANDARD base64 (StdEncoding)
    expect(material.signingPrivateKey).toBeUndefined();

    const stored = await getSigningKey();
    expect(stored).toBeTruthy();
    expect(stored.extractable).toBe(false);
    await expect(signSomething(stored)).resolves.toBeTruthy();
  });

  it('falls back to an extractable pkcs8 copy (warning 67) when IndexedDB is unavailable', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    const material = await generateSigningKeyMaterial();

    expect(material.signingPublicKey).toBeTruthy();
    expect(material.signingPrivateKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(storeLog).toHaveBeenCalledWith('warning', 67, expect.anything(), expect.stringContaining('signingKeyStore'));
  });

  it('does not coexist with the RSA key record — both live under separate ids', async () => {
    const rsaPair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: { name: 'SHA-512' } },
      false,
      ['encrypt', 'decrypt']
    );
    await savePrivateKey(rsaPair.privateKey);

    await generateSigningKeyMaterial();

    const { getPrivateKey } = await import('@background/functions/privateKeyStore.js');
    expect((await getPrivateKey()).algorithm.name).toBe('RSA-OAEP');
    expect((await getSigningKey()).algorithm.name).toBe('ECDSA');
  });
});

describe('getOrMigrateSigningKey', () => {
  it('returns the IndexedDB key when no storage.local fallback exists', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await saveSigningKey(pair.privateKey);

    const key = await getOrMigrateSigningKey({ keys: {} });

    expect(key).toBeTruthy();
    await expect(signSomething(key)).resolves.toBeTruthy();
  });

  it('returns null when no key exists anywhere', async () => {
    expect(await getOrMigrateSigningKey({ keys: {} })).toBeNull();
  });

  it('imports and promotes a storage.local pkcs8 fallback as non-extractable, keeping the plaintext until durability is proven', async () => {
    const legacy = await makeLegacyPkcs8();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPrivateKey: legacy } });

    const key = await getOrMigrateSigningKey({ keys: { signingPrivateKey: legacy } });

    expect(key).toBeTruthy();
    expect(key.extractable).toBe(false);
    // Promoted into IndexedDB…
    expect(await getSigningKey()).toBeTruthy();
    // …but the plaintext survives (a put that resolves proves nothing about
    // persistence — see privateKeyStore's durability contract).
    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys.signingPrivateKey).toBe(legacy);
  });

  it('throws (never null) when the fallback is corrupt AND IndexedDB is broken', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    await expect(getOrMigrateSigningKey({ keys: { signingPrivateKey: 'not-a-key' } })).rejects.toThrow('IndexedDB unavailable');
  });
});

describe('ensureUsableSigningKeyMaterial', () => {
  it('keeps the existing pair when the private half is usable', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated).toBe(false);
    expect(result.signingPublicKey).toBe(material.signingPublicKey);
  });

  it('regenerates when the public key exists but the private half is gone', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: 'orphaned-public' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated).toBe(true);
    expect(result.signingPublicKey).not.toBe('orphaned-public');

    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys.signingPublicKey).toBe(result.signingPublicKey);
    expect(stored.keys.publicKey).toBe('rsa-pub'); // RSA fields untouched
  });

  it('generates a first pair when none exists', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated).toBe(true);
    expect(result.signingPublicKey).toBeTruthy();
    expect(await getSigningKey()).toBeTruthy();
  });

  it('propagates a transient IndexedDB failure instead of regenerating over a possibly-live key', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: 'existing-public' } });
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    // No storage.local fallback + broken IndexedDB → getOrMigrateSigningKey
    // throws → ensure must NOT mint a new pair (the registered private key may
    // still be sitting in the temporarily-unreachable IndexedDB).
    await expect(ensureUsableSigningKeyMaterial()).rejects.toThrow('IndexedDB unavailable');
  });
});
