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

const preferIdb = vi.fn(() => true);
vi.mock('./keyStoragePolicy.js', () => ({ preferIdb: () => preferIdb() }));

import createKeyStore from './keyStore.js';

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const b64 = buf => Buffer.from(buf).toString('base64');
const fromB64 = str => Uint8Array.from(Buffer.from(str, 'base64')).buffer;

const logFallback = vi.fn().mockResolvedValue(undefined);

const store = createKeyStore({
  recordId: 'testKey',
  storageField: 'testPrivateKey',
  publicField: 'testPublicKey',
  importKey: base64 => crypto.subtle.importKey('pkcs8', fromB64(base64), ECDSA, false, ['sign']),
  generatePair: extractable => crypto.subtle.generateKey(ECDSA, extractable, ['sign', 'verify']),
  exportPublic: async key => b64(await crypto.subtle.exportKey('spki', key)),
  exportPrivate: async key => b64(await crypto.subtle.exportKey('pkcs8', key)),
  logFallback
});

beforeEach(() => {
  vi.clearAllMocks();
  preferIdb.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createKeyStore.generateMaterial', () => {
  it('stores a non-extractable key in IndexedDB and returns only the public half when IndexedDB is preferred and works', async () => {
    const material = await store.generateMaterial();

    expect(material.testPublicKey).toBeTruthy();
    expect(material.testPrivateKey).toBeUndefined();
    const stored = await store.get();
    expect(stored.extractable).toBe(false);
    expect(logFallback).not.toHaveBeenCalled();
  });

  it('falls back to a pkcs8 copy for storage.local and logs when IndexedDB is unavailable', async () => {
    globalThis.indexedDB = { open: () => { throw new Error('IndexedDB unavailable'); } };

    const material = await store.generateMaterial();

    expect(material.testPrivateKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(logFallback).toHaveBeenCalledTimes(1);
    // The fallback copy round-trips through the read rule.
    const key = await store.resolve({ keys: { testPrivateKey: material.testPrivateKey } });
    expect(key.extractable).toBe(false);
  });

  it('writes the pkcs8 copy WITHOUT a fallback log when the platform policy chooses storage.local', async () => {
    preferIdb.mockReturnValue(false);

    const material = await store.generateMaterial();

    expect(material.testPrivateKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(await store.get()).toBeUndefined();
    expect(logFallback).not.toHaveBeenCalled();
  });

  it('removes a stale IndexedDB record before generating, so an old key can never shadow the new one', async () => {
    await store.generateMaterial();
    const first = await store.get();

    await store.generateMaterial();
    const second = await store.get();

    expect(second).not.toBe(first);
  });

  it('under a storage.local policy still clears a stale IndexedDB record', async () => {
    await store.generateMaterial();
    expect(await store.get()).toBeTruthy();

    preferIdb.mockReturnValue(false);
    await store.generateMaterial();

    expect(await store.get()).toBeUndefined();
  });
});
