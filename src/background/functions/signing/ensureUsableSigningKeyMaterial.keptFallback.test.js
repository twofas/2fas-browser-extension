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

/* global crypto, Buffer */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
// The recovery of the public half fails here (it never does for a real P-256
// signing key): the fallback keeps the survivor as the live key, unregistrable,
// rather than generating over a key the backend may already hold.
vi.mock('./recoverSigningPublicKey.js', () => ({ default: vi.fn().mockResolvedValue(null) }));

import storeLog from '@partials/storeLog.js';
import ensureUsableSigningKeyMaterial from './ensureUsableSigningKeyMaterial.js';
import { getSigningKey, getOrMigrateSigningKey, saveSigningKey } from './signingKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const makeEcdsaPair = extractable => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, extractable, ['sign', 'verify']);
const exportSpki = async publicKey => Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64');
const orphanSpki = async () => exportSpki((await makeEcdsaPair(true)).publicKey);
const logsWithId = id => storeLog.mock.calls.filter(call => call[1] === id);
const cause74 = () => logsWithId(74)[0]?.[2]?.cause;
const signsFor = async (privateKey, publicKey) => crypto.subtle.verify(
  { name: 'ECDSA', hash: { name: 'SHA-256' } },
  publicKey,
  await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, privateKey, new TextEncoder().encode('probe')),
  new TextEncoder().encode('probe')
);
const KEPT = { signingPublicKey: null, regenerated: false, registrable: false };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ensureUsableSigningKeyMaterial — kept fallback when the public half cannot be recovered', () => {
  it('pairMismatch: the survivor stays live, the orphaned public key is dropped, nothing is registrable (74 kept)', async () => {
    const survivor = await makeEcdsaPair(false);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki() } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ ...KEPT, persisted: true });
    expect(await signsFor(await getSigningKey(), survivor.publicKey)).toBe(true);

    const stored = await loadFromLocalStorage(['keys', 'signingKeyUnregistrable']);
    expect(Object.keys(stored.keys).join()).toBe('publicKey');
    expect(stored.signingKeyUnregistrable).toBe(true);
    expect(cause74()).toEqual({ reason: 'pairMismatch', outcome: 'kept', storedIn: 'idb' });
  });

  it('publicMissing: kept and reported once', async () => {
    await saveSigningKey((await makeEcdsaPair(false)).privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    const first = await ensureUsableSigningKeyMaterial();
    const second = await ensureUsableSigningKeyMaterial();

    expect(first).toMatchObject({ ...KEPT, persisted: true });
    expect(second).toMatchObject({ ...KEPT, persisted: false });
    expect(logsWithId(74).length).toBe(1);
    expect(cause74()).toEqual({ reason: 'publicMissing', outcome: 'kept', storedIn: 'idb' });
  });

  it('storage.local tier (Safari policy): a pkcs8 survivor is kept in place', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    const survivor = await makeEcdsaPair(true);
    const survivorPkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', survivor.privateKey)).toString('base64');
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub', signingPublicKey: await orphanSpki(), signingPrivateKey: survivorPkcs8 } });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ ...KEPT, persisted: true });

    const { keys } = await loadFromLocalStorage(['keys']);
    expect(Object.keys(keys).sort().join()).toBe('publicKey,signingPrivateKey');
    expect(await signsFor(await getOrMigrateSigningKey({ keys }), survivor.publicKey)).toBe(true);
    expect(cause74()).toEqual({ reason: 'pairMismatch', outcome: 'kept', storedIn: 'local' });
  });

  it('forNewIdentity regenerates over a kept survivor: the row it may have signed for is gone', async () => {
    const survivor = await makeEcdsaPair(false);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, signingKeyUnregistrable: true });

    const result = await ensureUsableSigningKeyMaterial({ forNewIdentity: true });

    expect(result.regenerated === true).toBe(true);
    expect(await signsFor(await getSigningKey(), survivor.publicKey)).toBe(false);
    expect((await loadFromLocalStorage(['signingKeyUnregistrable'])).signingKeyUnregistrable).toBe(false);
    expect(cause74()).toEqual({ reason: 'publicMissing', outcome: 'regenerated', storedIn: 'idb' });
  });

  it('while signing is active the regeneration is refused and nothing is written or logged', async () => {
    const survivor = await makeEcdsaPair(false);
    await saveSigningKey(survivor.privateKey);
    const orphan = await orphanSpki();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: orphan },
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    const refusal = await ensureUsableSigningKeyMaterial().catch(err => err);

    expect(refusal instanceof Error && refusal.code === 'SIGNING_ACTIVE').toBe(true);
    expect((await loadFromLocalStorage(['keys'])).keys?.signingPublicKey === orphan).toBe(true);
    expect(await signsFor(await getSigningKey(), survivor.publicKey)).toBe(true);
    expect(logsWithId(74).length).toBe(0);
  });
});
