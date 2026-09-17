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

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import browser from 'webextension-polyfill';
import storeLog from '@partials/storeLog.js';
import {
  generateSigningKeyMaterial,
  getOrMigrateSigningKey,
  saveSigningKey,
  getSigningKey,
  deleteSigningKey,
  getSigningKeyMeta,
  saveSigningKeyMeta,
  signingKeyPairMatches,
  withKeyMaterialLock,
  SIGNING_KEY_ID
} from './signingKeyStore.js';
import ensureUsableSigningKeyMaterial from './ensureUsableSigningKeyMaterial.js';
import { savePrivateKey } from '@background/functions/privateKeyStore.js';
import { getKeyRecord } from '@background/functions/cryptoKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { longestSurvivor } from '@test/helpers/keySinks.js';

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

afterEach(() => {
  vi.unstubAllEnvs();
});

// Runtime SPKI of a throwaway key; asserted only through booleans.
const makeSpki = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

describe('signingKeyMeta companion record', () => {
  it('IndexedDB-tier generation writes the public-key companion in the same transaction', async () => {
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    let material;
    let writes;

    try {
      material = await generateSigningKeyMaterial();
      writes = transaction.mock.calls.filter(args => args[1] === 'readwrite').length;
    } finally {
      transaction.mockRestore();
    }

    const meta = await getSigningKeyMeta();
    expect(writes).toBe(1);
    expect(meta?.v === 1).toBe(true);
    expect(meta?.publicKey === material.signingPublicKey).toBe(true);
  });

  it('a regeneration replaces the companion together with the private key', async () => {
    await generateSigningKeyMaterial();
    const second = await generateSigningKeyMaterial();

    expect((await getSigningKeyMeta())?.publicKey === second.signingPublicKey).toBe(true);
  });

  it('writes no companion when the platform policy keeps new keys in storage.local (Safari)', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    const material = await generateSigningKeyMaterial();

    expect(typeof material.signingPrivateKey === 'string').toBe(true);
    expect((await getSigningKeyMeta()) === undefined).toBe(true);
    expect((await getSigningKey()) === undefined).toBe(true);
  });

  it('saveSigningKeyMeta stores {v: 1, publicKey} and getSigningKeyMeta reads it back', async () => {
    const publicKey = await makeSpki();

    await saveSigningKeyMeta({ publicKey });

    const meta = await getSigningKeyMeta();
    expect(meta?.v === 1 && meta?.publicKey === publicKey).toBe(true);
  });

  it('saveSigningKeyMeta refuses a meta without a public key and writes nothing', async () => {
    await expect(saveSigningKeyMeta({})).rejects.toThrow(TypeError);

    expect((await getSigningKeyMeta()) === undefined).toBe(true);
  });

  it('deleteSigningKey removes the companion with the key', async () => {
    await generateSigningKeyMaterial();

    await deleteSigningKey();

    expect((await getSigningKey()) === undefined).toBe(true);
    expect((await getSigningKeyMeta()) === undefined).toBe(true);
  });

  it('getSigningKeyMeta throws (never undefined) when IndexedDB is broken', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    await expect(getSigningKeyMeta()).rejects.toThrow('IndexedDB unavailable');
  });
});

describe('generateSigningKeyMaterial', () => {
  it('stores a non-extractable CryptoKey in IndexedDB and returns only the public key', async () => {
    const material = await generateSigningKeyMaterial();

    expect(/^[A-Za-z0-9+/]+=*$/.test(material.signingPublicKey)).toBe(true); // STANDARD base64 (StdEncoding)
    expect(material.signingPrivateKey === undefined).toBe(true);

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

    expect(typeof material.signingPublicKey === 'string' && material.signingPublicKey.length > 0).toBe(true);
    expect(/^[A-Za-z0-9+/]+=*$/.test(material.signingPrivateKey)).toBe(true);
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

  it('uses a storage.local pkcs8 copy in place — imported non-extractable, never promoted, never stripped', async () => {
    const legacy = await makeLegacyPkcs8();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPrivateKey: legacy } });

    const key = await getOrMigrateSigningKey({ keys: { signingPrivateKey: legacy } });

    expect(key).toBeTruthy();
    expect(key.extractable).toBe(false);
    await expect(signSomething(key)).resolves.toBeTruthy();
    // Not promoted into IndexedDB, plaintext untouched.
    expect(await getSigningKey()).toBeUndefined();
    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys.signingPrivateKey === legacy).toBe(true);
  });

  it('prefers the storage.local copy over a stale IndexedDB record', async () => {
    const stale = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    await saveSigningKey(stale.privateKey);
    const legacy = await makeLegacyPkcs8();

    const key = await getOrMigrateSigningKey({ keys: { signingPrivateKey: legacy } });

    // Different key object than the stale record (it came from the pkcs8 import).
    expect(key).not.toBe(await getSigningKey());
    await expect(signSomething(key)).resolves.toBeTruthy();
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
    expect(result.signingPublicKey === material.signingPublicKey).toBe(true);
  });

  it('regenerates when the public key exists but the private half is gone', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: 'orphaned-public' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated).toBe(true);
    expect(result.signingPublicKey !== 'orphaned-public').toBe(true);

    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys.signingPublicKey === result.signingPublicKey).toBe(true);
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

// Every key below is generated at runtime and only ever compared with `===`
// inside a boolean, or scanned with longestSurvivor — never printed.
const makeEcdsaPair = extractable => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, extractable, ['sign', 'verify']);
const exportSpki = async publicKey => Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64');
const logsWithId = id => storeLog.mock.calls.filter(call => call[1] === id);
const ACTIVE_SIGNING = { active: true, conflict: false, registrationRequired: false, auth401Count: 0 };

describe('withKeyMaterialLock', () => {
  it('runs callers one at a time in order, and a rejection never wedges the queue', async () => {
    const order = [];
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });

    const first = withKeyMaterialLock(async () => {
      order.push('first:start');
      await gate;
      order.push('first:end');
      throw new Error('boom');
    });
    const second = withKeyMaterialLock(async () => {
      order.push('second');

      return 2;
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(order.join()).toBe('first:start');

    release();

    await expect(first).rejects.toThrow('boom');
    expect(await second).toBe(2);
    expect(order.join()).toBe('first:start,first:end,second');
  });
});

describe('signingKeyPairMatches', () => {
  it('is true only for the public half of the same pair', async () => {
    const pair = await makeEcdsaPair(false);
    const other = await makeEcdsaPair(false);

    expect(await signingKeyPairMatches(await exportSpki(pair.publicKey), pair.privateKey)).toBe(true);
    expect(await signingKeyPairMatches(await exportSpki(other.publicKey), pair.privateKey)).toBe(false);
  });

  it('is false (never throws) for a public key that does not import as P-256 SPKI', async () => {
    const pair = await makeEcdsaPair(false);
    const rsa = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: { name: 'SHA-512' } },
      true,
      ['encrypt', 'decrypt']
    );

    expect(await signingKeyPairMatches('orphaned-public', pair.privateKey)).toBe(false);
    expect(await signingKeyPairMatches('%%%', pair.privateKey)).toBe(false);
    expect(await signingKeyPairMatches(undefined, pair.privateKey)).toBe(false);
    expect(await signingKeyPairMatches(await exportSpki(rsa.publicKey), pair.privateKey)).toBe(false);
  });
});

describe('ensureUsableSigningKeyMaterial — serialized, pair-checked, non-overwriting (1.9.1)', () => {
  it('concurrent callers share one key (M5/M12)', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const [a, b] = await Promise.all([ensureUsableSigningKeyMaterial(), ensureUsableSigningKeyMaterial()]);

    expect(a.signingPublicKey === b.signingPublicKey).toBe(true);
    expect([a, b].filter(result => result.regenerated === true).length).toBe(1);

    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys?.signingPublicKey === a.signingPublicKey).toBe(true);
    expect(await signingKeyPairMatches(stored.keys?.signingPublicKey, await getSigningKey())).toBe(true);
  });

  it('pair mismatch never reuses the orphaned public key and never replaces the private key (M8)', async () => {
    const pairA = await makeEcdsaPair(true);
    const pubA = await exportSpki(pairA.publicKey);
    const pairB = await makeEcdsaPair(false);
    const pubB = await exportSpki(pairB.publicKey);
    await saveSigningKey(pairB.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: pubA } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === false && result.restored === true).toBe(true);
    expect(result.signingPublicKey === pubB && result.signingPublicKey !== pubA).toBe(true);

    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys?.signingPublicKey === pubB).toBe(true);
    expect(stored.keys?.publicKey === 'rsa-pub').toBe(true);
    expect(await signingKeyPairMatches(stored.keys?.signingPublicKey, await getSigningKey())).toBe(true);

    expect(logsWithId(74).length).toBe(0);

    const logs = logsWithId(75);
    expect(logs.length).toBe(1);

    const payload = logs[0][2];
    expect(payload instanceof Error && logs[0][0] === 'warning').toBe(true);
    expect(longestSurvivor(payload, pubA)).toBe(0);
    expect(longestSurvivor(payload, pubB)).toBe(0);
  });

  it('refuses to regenerate over an active registration (R7) unless forNewIdentity', async () => {
    const orphan = await exportSpki((await makeEcdsaPair(true)).publicKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: orphan }, signing: ACTIVE_SIGNING });

    const refusal = await ensureUsableSigningKeyMaterial().catch(err => err);

    expect(refusal instanceof Error && refusal.code === 'SIGNING_ACTIVE').toBe(true);
    expect((await loadFromLocalStorage(['keys'])).keys?.signingPublicKey === orphan).toBe(true);
    expect((await getSigningKey()) === undefined).toBe(true);
    expect(logsWithId(74).length).toBe(0);

    const forced = await ensureUsableSigningKeyMaterial({ forNewIdentity: true });

    expect(forced.regenerated === true && forced.signingPublicKey !== orphan).toBe(true);
    expect((await loadFromLocalStorage(['keys'])).keys?.signingPublicKey === forced.signingPublicKey).toBe(true);
  });

  it('a lost public key is restored from the IndexedDB record (M6/M2d)', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === false).toBe(true);
    expect(result.restored === true).toBe(true);
    expect(result.signingPublicKey === material.signingPublicKey).toBe(true);

    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys?.signingPublicKey === material.signingPublicKey).toBe(true);
    expect(stored.keys?.publicKey === 'rsa-pub').toBe(true);

    const restoredLogs = logsWithId(75);
    expect(restoredLogs.length).toBe(1);
    expect(restoredLogs[0][2] instanceof Error && restoredLogs[0][0] === 'warning').toBe(true);
    expect(longestSurvivor(restoredLogs[0][2], material.signingPublicKey)).toBe(0);
    expect(logsWithId(74).length).toBe(0);
  });

  it('restores while signing is active: a restore is not a rekey', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signing: ACTIVE_SIGNING });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.restored === true && result.signingPublicKey === material.signingPublicKey).toBe(true);
    expect(logsWithId(75).length).toBe(1);
  });

  it('never restores a companion record that does not pair with the surviving private key', async () => {
    const material = await generateSigningKeyMaterial();
    await saveSigningKeyMeta({ publicKey: await exportSpki((await makeEcdsaPair(true)).publicKey) });
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const result = await ensureUsableSigningKeyMaterial();

    // The stranger's public half is never adopted: the real one is recovered
    // from the surviving private key and the companion corrected with it.
    expect(result.regenerated === false && result.restored === true).toBe(true);
    expect(result.signingPublicKey === material.signingPublicKey).toBe(true);
    expect((await getSigningKeyMeta())?.publicKey === material.signingPublicKey).toBe(true);
    expect(logsWithId(74).length).toBe(0);
    expect(logsWithId(75)[0]?.[2]?.cause).toEqual({ source: 'derived' });
  });

  it('reuse backfills a missing companion record (1.9.0 layout)', async () => {
    const pair = await makeEcdsaPair(false);
    const spki = await exportSpki(pair.publicKey);
    await saveSigningKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki } });

    expect((await getSigningKeyMeta()) === undefined).toBe(true);

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === false && result.signingPublicKey === spki).toBe(true);
    expect((await getSigningKeyMeta())?.publicKey === spki).toBe(true);
    expect(logsWithId(74).length + logsWithId(75).length).toBe(0);
  });

  it('reuse behind a corrupt storage.local copy still backfills the companion of the IndexedDB key', async () => {
    const pair = await makeEcdsaPair(false);
    const spki = await exportSpki(pair.publicKey);
    await saveSigningKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki, signingPrivateKey: 'corrupt' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === false && result.signingPublicKey === spki).toBe(true);
    expect((await getSigningKeyMeta())?.publicKey === spki).toBe(true);
  });

  it('reuse replaces a companion record that names a different key', async () => {
    const pair = await makeEcdsaPair(false);
    const spki = await exportSpki(pair.publicKey);
    await saveSigningKey(pair.privateKey);
    await saveSigningKeyMeta({ publicKey: await exportSpki((await makeEcdsaPair(true)).publicKey) });
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki } });

    await ensureUsableSigningKeyMaterial();

    expect((await getSigningKeyMeta())?.publicKey === spki).toBe(true);
  });

  it('a failing backfill never fails the reuse', async () => {
    const pair = await makeEcdsaPair(false);
    const spki = await exportSpki(pair.publicKey);
    await saveSigningKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki } });

    const original = IDBDatabase.prototype.transaction;
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (...args) {
      if (args[1] === 'readwrite') {
        throw new Error('write refused');
      }

      return original.apply(this, args);
    });
    let result;

    try {
      result = await ensureUsableSigningKeyMaterial();
    } finally {
      transaction.mockRestore();
    }

    expect(result.regenerated === false && result.signingPublicKey === spki).toBe(true);
    expect((await getSigningKeyMeta()) === undefined).toBe(true);
  });

  it('writes no companion for a storage.local key or on Safari', async () => {
    const legacyPair = await makeEcdsaPair(true);
    const legacyPkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', legacyPair.privateKey)).toString('base64');
    const legacySpki = await exportSpki(legacyPair.publicKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: legacySpki, signingPrivateKey: legacyPkcs8 } });

    const local = await ensureUsableSigningKeyMaterial();

    expect(local.regenerated === false && local.signingPublicKey === legacySpki).toBe(true);
    expect((await loadFromLocalStorage(['keys'])).keys?.signingPrivateKey === legacyPkcs8).toBe(true);
    expect((await getSigningKeyMeta()) === undefined).toBe(true);

    vi.stubEnv('EXT_PLATFORM', 'Safari');
    const idbPair = await makeEcdsaPair(false);
    const idbSpki = await exportSpki(idbPair.publicKey);
    await saveSigningKey(idbPair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: idbSpki } });

    const safari = await ensureUsableSigningKeyMaterial();

    expect(safari.regenerated === false && safari.signingPublicKey === idbSpki).toBe(true);
    expect((await getSigningKeyMeta()) === undefined).toBe(true);
  });

  it.each([
    {
      name: 'privateMissing: public key present, no private key anywhere',
      reason: 'privateMissing',
      storedIn: 'idb',
      outcome: 'regenerated',
      seed: async () => {
        const spki = await exportSpki((await makeEcdsaPair(true)).publicKey);
        await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki } });

        return spki;
      }
    },
    {
      name: 'importFailed: a storage.local pkcs8 that does not import',
      reason: 'importFailed',
      storedIn: 'idb',
      outcome: 'regenerated',
      seed: async () => {
        const spki = await exportSpki((await makeEcdsaPair(true)).publicKey);
        await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki, signingPrivateKey: 'corrupt' } });

        return spki;
      }
    },
    {
      name: 'privateMissing on Safari: the replacement lives in storage.local',
      reason: 'privateMissing',
      storedIn: 'local',
      outcome: 'regenerated',
      platform: 'Safari',
      seed: async () => {
        const spki = await exportSpki((await makeEcdsaPair(true)).publicKey);
        await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki } });

        return spki;
      }
    }
  ])('log 74 — $name', async ({ reason, storedIn, outcome, platform, seed }) => {
    if (platform) {
      vi.stubEnv('EXT_PLATFORM', platform);
    }

    const previous = await seed();

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === (outcome === 'regenerated')).toBe(true);

    const logs = logsWithId(74);
    expect(logs.length).toBe(1);

    const payload = logs[0][2];
    expect(payload.cause?.reason === reason).toBe(true);
    expect(payload.cause?.storedIn === storedIn).toBe(true);
    expect(payload.cause?.outcome === outcome).toBe(true);
    expect(Object.keys(payload.cause || {}).sort().join()).toBe('outcome,reason,storedIn');
    expect(longestSurvivor(JSON.stringify(payload.cause), previous)).toBe(0);
    expect(longestSurvivor(payload, previous)).toBe(0);
    expect(longestSurvivor(payload, result.signingPublicKey || '')).toBe(0);
    expect(logsWithId(75).length).toBe(0);
  });

  it('a first generation logs no 74', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === true).toBe(true);
    expect(logsWithId(74).length + logsWithId(75).length).toBe(0);
  });

  it('reports 74 only after releasing the key-material lock, and a failing log is swallowed', async () => {
    const spki = await exportSpki((await makeEcdsaPair(true)).publicKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: spki } });

    let failLog;
    const logGate = new Promise((resolve, reject) => {
      failLog = reject;
    });
    // Handled here too, so the rejection never surfaces as unhandled when no caller awaits it.
    logGate.catch(() => {});
    storeLog.mockImplementation(() => logGate);

    try {
      const ensured = ensureUsableSigningKeyMaterial();

      await vi.waitFor(() => {
        if (logsWithId(74).length !== 1) {
          throw new Error('74 not reported yet');
        }
      });

      // The log is still in flight, yet the lock is free.
      expect((await withKeyMaterialLock(async () => 'free')) === 'free').toBe(true);

      failLog(new Error('log sink down'));

      const result = await ensured;
      expect(result.regenerated === true).toBe(true);
    } finally {
      failLog(new Error('log sink down'));
      storeLog.mockResolvedValue(undefined);
    }
  });

  it('writes nothing when a reset replaced the identity during generation (compare-and-write)', async () => {
    const spki = await exportSpki((await makeEcdsaPair(true)).publicKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-1', signingPublicKey: spki }, signingKeyGenerations: 1, signingKeySends: 2 });

    const realGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey').mockImplementation(async (...args) => {
      // A reset cleared storage and re-armed its attempt counter meanwhile.
      await browser.storage.local.clear();
      await browser.storage.local.set({ attempt: 1 });

      return realGenerateKey(...args);
    });
    let result;

    try {
      result = await ensureUsableSigningKeyMaterial();
    } finally {
      generateKey.mockRestore();
    }

    expect(result.regenerated === true && result.persisted === false).toBe(true);

    const after = await loadFromLocalStorage(null);
    expect(after.keys === undefined).toBe(true);
    expect('signingKeyGenerations' in after || 'signingKeySends' in after || 'signingKeyGeneratedAt' in after).toBe(false);
    expect(logsWithId(74).length).toBe(0);
  });

  it.each([
    { name: 'a restore', seed: () => generateSigningKeyMaterial() },
    { name: 'a generation', seed: async () => {} }
  ])('writes nothing into storage a reset has just cleared ($name)', async ({ seed }) => {
    await seed();
    // storageReset cleared storage.local and re-armed its attempt counter; its
    // own keys write has not run yet, so no RSA identity is stored.
    await browser.storage.local.set({ attempt: 1 });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.persisted === false).toBe(true);

    const after = await loadFromLocalStorage(null);
    expect(after.keys === undefined).toBe(true);
    expect('signingKeyGenerations' in after || 'signingKeySends' in after || 'signingKeyGeneratedAt' in after).toBe(false);
    expect(logsWithId(74).length + logsWithId(75).length).toBe(0);
  });
});

describe('ensureUsableSigningKeyMaterial — key-lineage counters (log 64 diagnostics)', () => {
  it('a generation bumps signingKeyGenerations, zeroes signingKeySends and stamps signingKeyGeneratedAt in the keys write', async () => {
    const spki = await exportSpki((await makeEcdsaPair(true)).publicKey);
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: spki },
      signingKeyGenerations: 2,
      signingKeySends: 5,
      signingKeyGeneratedAt: 1000
    });

    const set = vi.spyOn(browser.storage.local, 'set');
    const before = Date.now();
    let keyWrites;

    try {
      await ensureUsableSigningKeyMaterial();
      keyWrites = set.mock.calls.map(call => call[0]).filter(arg => typeof arg?.keys?.signingPublicKey === 'string');
    } finally {
      set.mockRestore();
    }

    expect(keyWrites.length).toBe(1);

    const [write] = keyWrites;
    expect(write.signingKeyGenerations).toBe(3);
    expect(write.signingKeySends).toBe(0);
    expect(typeof write.signingKeyGeneratedAt === 'number' && write.signingKeyGeneratedAt >= before && write.signingKeyGeneratedAt <= Date.now()).toBe(true);

    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeySends', 'signingKeyGeneratedAt']);
    expect(stored.signingKeyGenerations).toBe(3);
    expect(stored.signingKeySends).toBe(0);
    expect(stored.signingKeyGeneratedAt === write.signingKeyGeneratedAt).toBe(true);
  });

  it.each([
    { label: 'absent', previous: undefined },
    { label: 'a string', previous: '2' },
    { label: 'negative', previous: -1 },
    { label: 'fractional', previous: 1.5 }
  ])('a generation counts from 0 when the stored counter is $label', async ({ previous }) => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, ...(previous === undefined ? {} : { signingKeyGenerations: previous }) });

    await ensureUsableSigningKeyMaterial();

    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeySends']);
    expect(stored.signingKeyGenerations).toBe(1);
    expect(stored.signingKeySends).toBe(0);
  });

  it.each([
    {
      name: 'privateMissing, counter absent',
      reason: 'privateMissing',
      seed: async () => {
        await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await exportSpki((await makeEcdsaPair(true)).publicKey) } });
      }
    },
    {
      name: 'privateMissing, counter malformed',
      reason: 'privateMissing',
      seed: async () => {
        await saveToLocalStorage({
          keys: { publicKey: 'rsa-pub', signingPublicKey: await exportSpki((await makeEcdsaPair(true)).publicKey) },
          signingKeyGenerations: 'x'
        });
      }
    },
    {
      name: 'importFailed with nothing behind it, counter absent',
      reason: 'importFailed',
      seed: async () => {
        await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await exportSpki((await makeEcdsaPair(true)).publicKey), signingPrivateKey: 'corrupt' } });
      }
    }
  ])('a regeneration over a key from before the counters counts at least 2 ($name)', async ({ reason, seed }) => {
    await seed();

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === true).toBe(true);
    expect(logsWithId(74).length).toBe(1);
    expect(logsWithId(74)[0][2].cause?.reason === reason).toBe(true);

    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeySends']);
    expect(stored.signingKeyGenerations).toBe(2);
    expect(stored.signingKeySends).toBe(0);
  });

  it('a recovered survivor leaves the counters untouched: nothing was generated', async () => {
    await saveSigningKey((await makeEcdsaPair(false)).privateKey);
    const counters = { signingKeyGenerations: 4, signingKeySends: 2, signingKeyGeneratedAt: 1234 };
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await exportSpki((await makeEcdsaPair(true)).publicKey) }, ...counters });

    const recovered = await ensureUsableSigningKeyMaterial();

    expect(recovered.restored === true && recovered.regenerated === false).toBe(true);
    expect(await loadFromLocalStorage(Object.keys(counters))).toEqual(counters);
  });

  it('reuse and restore leave the counters untouched', async () => {
    const material = await generateSigningKeyMaterial();
    const counters = { signingKeyGenerations: 4, signingKeySends: 2, signingKeyGeneratedAt: 1234 };
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey }, ...counters });

    const reused = await ensureUsableSigningKeyMaterial();

    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });
    const restored = await ensureUsableSigningKeyMaterial();

    expect(reused.regenerated === false && restored.restored === true).toBe(true);

    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeySends', 'signingKeyGeneratedAt']);
    expect(stored.signingKeyGenerations).toBe(4);
    expect(stored.signingKeySends).toBe(2);
    expect(stored.signingKeyGeneratedAt).toBe(1234);
  });
});

const PROBE_BYTES = new TextEncoder().encode('probe');

/**
 * Whether `privateKey` signs what `publicKey` verifies. The public key is the
 * in-memory CryptoKey of a runtime pair; neither key is ever exported here.
 * @param {CryptoKey} privateKey - ECDSA P-256 private key.
 * @param {CryptoKey} publicKey - ECDSA P-256 public key.
 * @return {Promise<boolean>}
 */
const signsFor = async (privateKey, publicKey) => crypto.subtle.verify(
  { name: 'ECDSA', hash: { name: 'SHA-256' } },
  publicKey,
  await signSomething(privateKey),
  PROBE_BYTES
);

// The backend never replaces a registered key (same key = no-op, another key =
// 400, no reset). A private key that survived but lost its public half may be
// the one the backend holds, so it is never generated over: its public half is
// recovered from its own signatures (Web Crypto confirms the candidate), and
// the normal keyed PUT then registers it (first key), confirms it (same key,
// no-op) or reveals the conflict (another key). Only a key that is gone gets a
// fresh pair.
describe('ensureUsableSigningKeyMaterial — a surviving private key is never replaced (1.9.1)', () => {
  const orphanSpki = async () => exportSpki((await makeEcdsaPair(true)).publicKey);
  const cause74 = () => logsWithId(74)[0]?.[2]?.cause;
  const cause75 = () => logsWithId(75)[0]?.[2]?.cause;

  it('pairMismatch with a companion that pairs with the survivor: restored from the companion (75, source companion)', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki() } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === false && result.restored === true).toBe(true);
    expect(result.signingPublicKey === material.signingPublicKey).toBe(true);
    expect((await loadFromLocalStorage(['keys'])).keys?.signingPublicKey === material.signingPublicKey).toBe(true);
    expect(logsWithId(75).length === 1 && logsWithId(74).length === 0).toBe(true);
    expect(cause75()).toEqual({ source: 'companion' });
  });

  it('a restore from the companion clears the unregistrable marker too', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signingKeyUnregistrable: true });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.restored === true && result.signingPublicKey === material.signingPublicKey).toBe(true);
    expect((await loadFromLocalStorage(['signingKeyUnregistrable'])).signingKeyUnregistrable).toBe(false);
    expect(cause75()).toEqual({ source: 'companion' });
  });

  it('pairMismatch without a companion (a 1.9.0 key): the public half is recovered from the private key (75, source derived) and the companion backfilled', async () => {
    const survivor = await makeEcdsaPair(false);
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki() }, extensionID: 'ext-1' });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ regenerated: false, restored: true, persisted: true });
    expect(result.signingPublicKey === survivorSpki).toBe(true);

    const stored = await loadFromLocalStorage(['keys', 'signingKeyUnregistrable']);
    expect(stored.keys.signingPublicKey === survivorSpki).toBe(true);
    expect(stored.signingKeyUnregistrable).toBe(false);
    expect((await getSigningKeyMeta())?.publicKey === survivorSpki).toBe(true);
    expect(await signsFor(await getSigningKey(), survivor.publicKey)).toBe(true);
    expect(logsWithId(74).length).toBe(0);
    expect(cause75()).toEqual({ source: 'derived' });
  });

  it('publicMissing without a companion: recovered once, reused after', async () => {
    const survivor = await makeEcdsaPair(false);
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const first = await ensureUsableSigningKeyMaterial();
    const second = await ensureUsableSigningKeyMaterial();

    expect(first).toMatchObject({ regenerated: false, restored: true, persisted: true });
    expect(second).toMatchObject({ regenerated: false });
    expect(second.restored === undefined && second.signingPublicKey === survivorSpki).toBe(true);
    expect(logsWithId(75).length).toBe(1);
    expect(logsWithId(74).length).toBe(0);
  });

  it("importFailed with an IndexedDB key behind the corrupt copy: that key's public half is recovered", async () => {
    const survivor = await makeEcdsaPair(false);
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki(), signingPrivateKey: 'corrupt' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ regenerated: false, restored: true });
    expect((await loadFromLocalStorage(['keys'])).keys.signingPublicKey === survivorSpki).toBe(true);
    expect(cause75()).toEqual({ source: 'derived' });
  });

  it('importFailed with nothing behind it regenerates: there is nothing to keep', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki(), signingPrivateKey: 'corrupt' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === true).toBe(true);
    expect(await signingKeyPairMatches(result.signingPublicKey, await getSigningKey())).toBe(true);
    expect(cause74()).toEqual({ reason: 'importFailed', outcome: 'regenerated', storedIn: 'idb' });
  });

  it('privateMissing regenerates: nothing survived', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki() }, signingKeyUnregistrable: true });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === true).toBe(true);
    expect(cause74()).toEqual({ reason: 'privateMissing', outcome: 'regenerated', storedIn: 'idb' });
    expect((await loadFromLocalStorage(['signingKeyUnregistrable'])).signingKeyUnregistrable).toBe(false);
  });

  it('a kept survivor that is lost later regenerates as privateMissing, never as a silent first generation', async () => {
    // The kept write dropped the public key and set the marker; then IndexedDB
    // lost the key. Without the marker this reads as "no material at all".
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signingKeyUnregistrable: true, signingKeyGenerations: 1 });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === true).toBe(true);
    expect(logsWithId(74).length).toBe(1);
    expect(cause74()).toEqual({ reason: 'privateMissing', outcome: 'regenerated', storedIn: 'idb' });

    const stored = await loadFromLocalStorage(['signingKeyGenerations', 'signingKeyUnregistrable']);
    expect(stored.signingKeyGenerations).toBe(2);
    expect(stored.signingKeyUnregistrable).toBe(false);
  });

  it('storage.local tier (Safari policy): a pkcs8 survivor with a mismatched public key is recovered, no companion written', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    const survivor = await makeEcdsaPair(true);
    const survivorSpki = await exportSpki(survivor.publicKey);
    const survivorPkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', survivor.privateKey)).toString('base64');
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki(), signingPrivateKey: survivorPkcs8 } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ regenerated: false, restored: true, persisted: true });

    const { keys } = await loadFromLocalStorage(['keys']);
    expect(Object.keys(keys).sort().join()).toBe('publicKey,signingPrivateKey,signingPublicKey');
    expect(keys.signingPrivateKey === survivorPkcs8 && keys.signingPublicKey === survivorSpki).toBe(true);
    expect((await getSigningKeyMeta()) === undefined).toBe(true);
    expect(cause75()).toEqual({ source: 'derived' });
  });

  it('IndexedDB unavailable (Firefox permanent private browsing): a pkcs8 survivor is recovered into storage.local', async () => {
    const survivor = await makeEcdsaPair(true);
    const survivorSpki = await exportSpki(survivor.publicKey);
    const survivorPkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', survivor.privateKey)).toString('base64');
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki(), signingPrivateKey: survivorPkcs8 } });
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ regenerated: false, restored: true, persisted: true });

    const { keys } = await loadFromLocalStorage(['keys']);
    expect(keys.signingPrivateKey === survivorPkcs8 && keys.signingPublicKey === survivorSpki).toBe(true);
  });

  it('forNewIdentity reuses a recovered survivor instead of generating over it', async () => {
    const survivor = await makeEcdsaPair(false);
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signingKeyUnregistrable: true });

    const result = await ensureUsableSigningKeyMaterial({ forNewIdentity: true });

    expect(result).toMatchObject({ regenerated: false, restored: true });
    expect(result.signingPublicKey === survivorSpki).toBe(true);
    expect(await signsFor(await getSigningKey(), survivor.publicKey)).toBe(true);
    expect((await loadFromLocalStorage(['signingKeyUnregistrable'])).signingKeyUnregistrable).toBe(false);
  });

  it('a mismatched public key is corrected while signing is active: a restore is not a rekey', async () => {
    const survivor = await makeEcdsaPair(false);
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki() }, signing: ACTIVE_SIGNING });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ regenerated: false, restored: true });
    expect((await loadFromLocalStorage(['keys'])).keys.signingPublicKey === survivorSpki).toBe(true);
    expect(await signsFor(await getSigningKey(), survivor.publicKey)).toBe(true);
    expect(logsWithId(74).length).toBe(0);
    expect(logsWithId(75).length).toBe(1);
  });

  it('a first generation logs no 74 and leaves the marker cleared', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result.regenerated === true).toBe(true);
    expect((await loadFromLocalStorage(['signingKeyUnregistrable'])).signingKeyUnregistrable).toBe(false);
    expect(logsWithId(74).length).toBe(0);
  });

  it('no record of a retained key is ever written: the survivor IS the live key', async () => {
    const survivor = await makeEcdsaPair(false);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki() } });

    await ensureUsableSigningKeyMaterial();

    expect((await getKeyRecord('signingPrivateKeyRetired')) === undefined).toBe(true);
    expect((await getKeyRecord('signingPrivateKeyRetiredMeta')) === undefined).toBe(true);
  });
});

describe('ensureUsableSigningKeyMaterial — an IndexedDB read failure never passes for a missing key (1.9.1, F3)', () => {
  /**
   * Runs `run` while the first IndexedDB read of the live signing key record throws.
   * @return {Promise<*>} What `run` settled with (a rejection is returned, not thrown).
   */
  const withFirstSigningKeyReadFailing = async run => {
    const originalGet = IDBObjectStore.prototype.get;
    let failed = false;
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (...args) {
      if (!failed && args[0] === SIGNING_KEY_ID) {
        failed = true;
        throw new Error('read refused');
      }

      return originalGet.apply(this, args);
    });

    try {
      return await run().then(value => value, err => err);
    } finally {
      get.mockRestore();
    }
  };

  it.each([
    { policy: 'IndexedDB', platform: undefined },
    { policy: 'storage.local', platform: 'Safari' }
  ])('no stored public key, a failed read while IndexedDB is writable: propagates, the unread key survives ($policy policy)', async ({ platform }) => {
    if (platform) {
      vi.stubEnv('EXT_PLATFORM', platform);
    }

    const unread = await makeEcdsaPair(false);
    await saveSigningKey(unread.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, extensionID: 'ext-1' });

    const outcome = await withFirstSigningKeyReadFailing(() => ensureUsableSigningKeyMaterial());

    expect(outcome instanceof Error).toBe(true);

    const live = await getSigningKey();
    expect(live !== undefined && await signsFor(live, unread.publicKey)).toBe(true);

    const { keys } = await loadFromLocalStorage(['keys']);
    expect(Object.keys(keys || {}).join()).toBe('publicKey');
    // The write probe leaves nothing behind.
    expect((await getKeyRecord('signingKeyWriteProbe')) === undefined).toBe(true);
    expect(logsWithId(74).length + logsWithId(75).length).toBe(0);
  });

  it('the next pass, with IndexedDB readable again, restores the same key instead of regenerating (75, no 74)', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, extensionID: 'ext-1' });

    const first = await withFirstSigningKeyReadFailing(() => ensureUsableSigningKeyMaterial());

    expect(first instanceof Error).toBe(true);

    const second = await ensureUsableSigningKeyMaterial();
    const { keys } = await loadFromLocalStorage(['keys']);

    expect(second.regenerated === false && second.restored === true).toBe(true);
    expect((keys?.signingPublicKey === material.signingPublicKey) === true).toBe(true);
    expect(logsWithId(75).length === 1 && logsWithId(74).length === 0).toBe(true);
  });

  it('an IndexedDB that can be neither read nor written (Firefox permanent private browsing) still gets a first key in storage.local', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, extensionID: 'ext-1' });
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    const result = await ensureUsableSigningKeyMaterial();
    const { keys } = await loadFromLocalStorage(['keys']);

    expect(result.regenerated === true && result.persisted === true).toBe(true);
    expect(typeof keys?.signingPrivateKey === 'string').toBe(true);
    expect(await signingKeyPairMatches(keys?.signingPublicKey, await getOrMigrateSigningKey({ keys }))).toBe(true);
    expect(logsWithId(74).length).toBe(0);
  });
});
