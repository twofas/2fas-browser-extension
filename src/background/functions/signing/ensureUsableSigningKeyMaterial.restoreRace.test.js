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
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

// The recovery is the one slow step of a restore (signatures + curve
// arithmetic); a reset that lands meanwhile replaces the identity. Its keys
// must stay untouched: the compare-and-write into fresh storage guards it.
const recover = vi.fn();
vi.mock('./recoverSigningPublicKey.js', () => ({ default: (...args) => recover(...args) }));

import storeLog from '@partials/storeLog.js';
import ensureUsableSigningKeyMaterial from './ensureUsableSigningKeyMaterial.js';
import { saveSigningKey } from './signingKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const makeEcdsaPair = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const exportSpki = async publicKey => Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64');
const logsWithId = id => storeLog.mock.calls.filter(call => call[1] === id);

beforeEach(() => {
  vi.clearAllMocks();
  recover.mockReset();
});

describe('ensureUsableSigningKeyMaterial — a reset racing the restore of the public key', () => {
  it('a reset landing while the public half is being recovered leaves the new identity alone', async () => {
    const survivor = await makeEcdsaPair();
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, extensionID: 'ext-1' });
    recover.mockImplementation(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'rsa-pub-2' }, extensionID: 'ext-2' });

      return survivorSpki;
    });

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ restored: true, regenerated: false, persisted: false });

    const stored = await loadFromLocalStorage(['keys', 'extensionID', 'signingKeyUnregistrable']);
    expect(stored.keys).toEqual({ publicKey: 'rsa-pub-2' });
    expect(stored.extensionID).toBe('ext-2');
    expect(stored.signingKeyUnregistrable).toBeUndefined();
    expect(logsWithId(75).length + logsWithId(74).length).toBe(0);
  });

  it('control: without a reset the recovered key is written and reported', async () => {
    const survivor = await makeEcdsaPair();
    const survivorSpki = await exportSpki(survivor.publicKey);
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' }, extensionID: 'ext-1' });
    recover.mockResolvedValue(survivorSpki);

    const result = await ensureUsableSigningKeyMaterial();

    expect(result).toMatchObject({ restored: true, persisted: true });
    expect((await loadFromLocalStorage(['keys'])).keys.signingPublicKey === survivorSpki).toBe(true);
    expect(logsWithId(75).length).toBe(1);
  });
});
