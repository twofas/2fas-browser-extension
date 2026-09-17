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

/* global crypto, IDBDatabase, IDBObjectStore, TextEncoder */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const preferIdb = vi.fn(() => true);
vi.mock('./keyStoragePolicy.js', () => ({ preferIdb: () => preferIdb() }));

// Pass-through spy, so a test can see WHEN a stale record is removed.
vi.mock('./cryptoKeyStore.js', async importOriginal => {
  const actual = await importOriginal();

  return { ...actual, deleteKeyRecord: vi.fn((...args) => actual.deleteKeyRecord(...args)) };
});

import createKeyStore from './keyStore.js';
import { saveKeyRecord, getKeyRecord, deleteKeyRecord } from './cryptoKeyStore.js';

// Key-safe assertions only: every key here is generated at runtime and checked
// through booleans and counts, so a failing test can never print key material.
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDSA_SIGN = { name: 'ECDSA', hash: { name: 'SHA-256' } };
const PROBE = new TextEncoder().encode('probe');
const META_ID = 'testKeyMeta';
const b64 = buf => Buffer.from(buf).toString('base64');
const fromB64 = str => Uint8Array.from(Buffer.from(str, 'base64')).buffer;

const generatePair = vi.fn(extractable => crypto.subtle.generateKey(ECDSA, extractable, ['sign', 'verify']));
const exportPrivate = vi.fn(async key => b64(await crypto.subtle.exportKey('pkcs8', key)));
const logFallback = vi.fn().mockResolvedValue(undefined);

const spec = {
  recordId: 'testKey',
  storageField: 'testPrivateKey',
  publicField: 'testPublicKey',
  importKey: base64 => crypto.subtle.importKey('pkcs8', fromB64(base64), ECDSA, false, ['sign']),
  generatePair: (...args) => generatePair(...args),
  exportPublic: async key => b64(await crypto.subtle.exportKey('spki', key)),
  exportPrivate: (...args) => exportPrivate(...args),
  logFallback
};

// No metaRecordId: the shape of the RSA token-key store.
const store = createKeyStore(spec);
// With a companion record: the shape of the signing-key store.
const metaStore = createKeyStore({ ...spec, metaRecordId: META_ID });

/**
 * Whether `privateKey` signs what the exported SPKI `publicKey` verifies.
 * @param {string} publicKey - SPKI, standard base64.
 * @param {CryptoKey} privateKey - ECDSA P-256 private key.
 * @return {Promise<boolean>}
 */
const pairMatches = async (publicKey, privateKey) => {
  const verifier = await crypto.subtle.importKey('spki', fromB64(publicKey), ECDSA, false, ['verify']);
  const signature = await crypto.subtle.sign(ECDSA_SIGN, privateKey, PROBE);

  return crypto.subtle.verify(ECDSA_SIGN, verifier, signature, PROBE);
};

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

  it('replaces a stale IndexedDB record', async () => {
    await store.generateMaterial();
    const first = await store.get();

    const material = await store.generateMaterial();
    const second = await store.get();

    expect(second).not.toBe(first);
    expect(await pairMatches(material.testPublicKey, second)).toBe(true);
  });

  it('under a storage.local policy still clears a stale IndexedDB record', async () => {
    await store.generateMaterial();
    expect(await store.get()).toBeTruthy();

    preferIdb.mockReturnValue(false);
    await store.generateMaterial();

    expect(await store.get()).toBeUndefined();
  });

  it.each([
    ['IndexedDB', true],
    ['storage.local', false]
  ])('a failed generation under the %s policy leaves the previous record intact', async (_, prefersIdb) => {
    await store.generateMaterial();
    preferIdb.mockReturnValue(prefersIdb);
    generatePair.mockRejectedValueOnce(new Error('crypto'));

    await expect(store.generateMaterial()).rejects.toThrow('crypto');

    expect((await store.get()) !== undefined).toBe(true);
  });

  it('writes no companion record for a store without metaRecordId (the RSA store)', async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    let puts;

    try {
      await store.generateMaterial();
      puts = put.mock.calls.length;
    } finally {
      put.mockRestore();
    }

    expect(puts).toBe(1);
    expect((await getKeyRecord(META_ID)) === undefined).toBe(true);
    expect((await getKeyRecord('signingKeyMeta')) === undefined).toBe(true);
  });

  it('writes the companion {v: 1, publicKey} with the private key in one IndexedDB transaction', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    let material;
    let writes;

    try {
      material = await metaStore.generateMaterial();
      writes = transaction.mock.calls.filter(args => args[1] === 'readwrite').length;
    } finally {
      transaction.mockRestore();
    }

    const meta = await metaStore.getMeta();
    expect(writes).toBe(1);
    expect(meta?.v === 1).toBe(true);
    expect(meta?.publicKey === material.testPublicKey).toBe(true);
    expect(await pairMatches(meta.publicKey, await metaStore.get())).toBe(true);
  });

  it('under a storage.local policy removes the stale record and its companion only after the replacement exists', async () => {
    await metaStore.generateMaterial();
    expect((await metaStore.get()) !== undefined).toBe(true);
    expect((await metaStore.getMeta()) !== undefined).toBe(true);

    preferIdb.mockReturnValue(false);
    exportPrivate.mockClear();
    deleteKeyRecord.mockClear();

    const material = await metaStore.generateMaterial();

    expect(typeof material.testPrivateKey === 'string').toBe(true);
    expect(exportPrivate.mock.calls.length).toBe(1);
    expect(deleteKeyRecord.mock.calls.length).toBe(1);
    expect(exportPrivate.mock.invocationCallOrder[0] < deleteKeyRecord.mock.invocationCallOrder[0]).toBe(true);
    expect((await metaStore.get()) === undefined).toBe(true);
    expect((await getKeyRecord(META_ID)) === undefined).toBe(true);
  });

  it('a forced fallback leaves no companion describing a key that is no longer in IndexedDB', async () => {
    await metaStore.generateMaterial();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('A mutation operation was attempted on a database that did not allow mutations.');
    });
    let material;

    try {
      material = await metaStore.generateMaterial();
    } finally {
      put.mockRestore();
    }

    expect(typeof material.testPrivateKey === 'string').toBe(true);
    expect(logFallback.mock.calls.length).toBe(1);
    expect((await metaStore.get()) === undefined).toBe(true);
    expect((await metaStore.getMeta()) === undefined).toBe(true);
  });
});

describe('createKeyStore companion record', () => {
  it('saveMeta stores {v: 1, publicKey} and getMeta reads it back', async () => {
    const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    const publicKey = b64(await crypto.subtle.exportKey('spki', pair.publicKey));

    await metaStore.saveMeta({ publicKey });

    const meta = await metaStore.getMeta();
    expect(meta?.v === 1 && meta?.publicKey === publicKey).toBe(true);
  });

  it('saveMeta refuses a record without a public key string and writes nothing', async () => {
    await expect(metaStore.saveMeta({})).rejects.toThrow(TypeError);
    await expect(metaStore.saveMeta({ publicKey: '' })).rejects.toThrow(TypeError);

    expect((await getKeyRecord(META_ID)) === undefined).toBe(true);
  });

  it('getMeta ignores a malformed record', async () => {
    await saveKeyRecord(META_ID, { v: 1 });

    expect((await metaStore.getMeta()) === undefined).toBe(true);
  });

  it('a store without metaRecordId has no companion to read or write', async () => {
    expect((await store.getMeta()) === undefined).toBe(true);
    await expect(store.saveMeta({ publicKey: 'x'.repeat(16) })).rejects.toThrow();
  });

  it('remove deletes the record and its companion together', async () => {
    await metaStore.generateMaterial();
    deleteKeyRecord.mockClear();

    await metaStore.remove();

    expect(deleteKeyRecord.mock.calls.length).toBe(1);
    expect((await metaStore.get()) === undefined).toBe(true);
    expect((await getKeyRecord(META_ID)) === undefined).toBe(true);
  });

  // A record the store does not own shares the object store but is no
  // companion: removal and regeneration never touch it.
  it.each([
    ['remove()', () => metaStore.remove()],
    ['a storage.local-policy generation', () => {
      preferIdb.mockReturnValue(false);

      return metaStore.generateMaterial();
    }],
    ['an IndexedDB-policy generation', () => metaStore.generateMaterial()]
  ])('%s leaves an unrelated record in the same store intact', async (_, act) => {
    const unrelated = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
    await saveKeyRecord('unrelatedRecord', unrelated.privateKey);
    await metaStore.generateMaterial();

    await act();

    const stored = await getKeyRecord('unrelatedRecord');
    const signature = await crypto.subtle.sign(ECDSA_SIGN, stored, PROBE);
    expect(await crypto.subtle.verify(ECDSA_SIGN, unrelated.publicKey, signature, PROBE)).toBe(true);
  });
});

describe('cryptoKeyStore transactions', () => {
  it('readwrite key transactions request strict durability', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    let calls;

    try {
      const pair = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
      await saveKeyRecord('t', pair.privateKey);
      await deleteKeyRecord('t');
      await getKeyRecord('t');
      calls = transaction.mock.calls.map(args => ({ mode: args[1], durability: args[2]?.durability }));
    } finally {
      transaction.mockRestore();
    }

    const writes = calls.filter(call => call.mode === 'readwrite');
    expect(writes.length).toBe(2);
    expect(writes.every(call => call.durability === 'strict')).toBe(true);
    expect(calls.some(call => call.mode === 'readonly')).toBe(true);
  });

  it('rolls back the key write when a companion record cannot be stored', async () => {
    const previous = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
    const next = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
    await saveKeyRecord('t', previous.privateKey);

    // A function is not structured-cloneable: the companion put throws DataCloneError.
    await expect(saveKeyRecord('t', next.privateKey, { companions: { tMeta: () => {} } })).rejects.toThrow();

    const stored = await getKeyRecord('t');
    const signature = await crypto.subtle.sign(ECDSA_SIGN, stored, PROBE);
    expect(await crypto.subtle.verify(ECDSA_SIGN, previous.publicKey, signature, PROBE)).toBe(true);
    expect((await getKeyRecord('tMeta')) === undefined).toBe(true);
  });

  it('deletes companion records in the same transaction as the key', async () => {
    const pair = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
    await saveKeyRecord('t', pair.privateKey, { companions: { tMeta: { v: 1, publicKey: 'opaque-label' } } });
    expect((await getKeyRecord('tMeta')) !== undefined).toBe(true);

    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    let writes;

    try {
      await deleteKeyRecord('t', { companions: ['tMeta'] });
      writes = transaction.mock.calls.filter(args => args[1] === 'readwrite').length;
    } finally {
      transaction.mockRestore();
    }

    expect(writes).toBe(1);
    expect((await getKeyRecord('t')) === undefined).toBe(true);
    expect((await getKeyRecord('tMeta')) === undefined).toBe(true);
  });
});
