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

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const enqueueBrowserRegistration = vi.fn().mockResolvedValue(undefined);
vi.mock('./enqueueBrowserRegistration.js', () => ({
  default: (...args) => enqueueBrowserRegistration(...args)
}));

// Only the key-material step is replaced: it is where a reset or a concurrent
// activation lands while this driver waits. SIGNING_ACTIVE stays the real export.
const ensureUsableSigningKeyMaterial = vi.fn();
vi.mock('@background/functions/signing/ensureUsableSigningKeyMaterial.js', async importOriginal => ({
  ...(await importOriginal()),
  default: (...args) => ensureUsableSigningKeyMaterial(...args)
}));

import browser from 'webextension-polyfill';
import storeLog from '@partials/storeLog.js';
import ensureSigningKeyRegistration from './ensureSigningKeyRegistration.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import { SIGNING_ACTIVE } from '@background/functions/signing/ensureUsableSigningKeyMaterial.js';
import { saveToLocalStorage } from '@localStorage/index.js';
import { installKeyConsoleTripwire } from '@test/helpers/keySinks.js';

const BROWSER_INFO = { name: 'ext #1234', browser_name: 'Chrome', browser_version: '139' };
const CREATE_RECORD = { op: 'create', payload: BROWSER_INFO, attempts: 0, firstAttemptAt: 1, nextAttemptAt: 1, reported: false };
// Opaque stand-in: the driver only needs a truthy result, never a real key.
const ENSURED = { signingPublicKey: 'opaque-signing-public-key', regenerated: false };

const logsWithId = id => storeLog.mock.calls.filter(call => call[1] === id);

beforeEach(async () => {
  vi.clearAllMocks();
  ensureUsableSigningKeyMaterial.mockReset();
  await saveToLocalStorage({
    extensionID: 'ext-1',
    browserInfo: BROWSER_INFO,
    keys: { publicKey: 'rsa-pub' },
    signing: { active: false, conflict: false, registrationRequired: false, auth401Count: 0 }
  });
});

describe('ensureSigningKeyRegistration — identity re-check before enqueue', () => {
  it('does not enqueue when a reset replaced the identity while the key was ensured', async () => {
    ensureUsableSigningKeyMaterial.mockImplementation(async () => {
      // The reset wiped the identity and its registration could not land yet.
      await browser.storage.local.remove('extensionID');
      await saveToLocalStorage({ keys: { publicKey: 'rsa-pub-2' }, [REGISTRATION_STORAGE_KEY]: CREATE_RECORD });

      return ENSURED;
    });

    await ensureSigningKeyRegistration();

    expect(ensureUsableSigningKeyMaterial.mock.calls.length).toBe(1);
    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
    expect(logsWithId(63).length).toBe(0);
  });

  it('does not enqueue when the identity was already re-registered under a new extensionID', async () => {
    ensureUsableSigningKeyMaterial.mockImplementation(async () => {
      await saveToLocalStorage({ extensionID: 'ext-2', keys: { publicKey: 'rsa-pub-2' } });

      return ENSURED;
    });

    await ensureSigningKeyRegistration();

    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
  });

  it('does not enqueue an update once a create record appeared for the same extensionID', async () => {
    ensureUsableSigningKeyMaterial.mockImplementation(async () => {
      await saveToLocalStorage({ [REGISTRATION_STORAGE_KEY]: { ...CREATE_RECORD, reregister: true } });

      return ENSURED;
    });

    await ensureSigningKeyRegistration();

    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
  });

  it('skips the enqueue when the re-check cannot read storage (the next start retries)', async () => {
    const realGet = browser.storage.local.get;
    let reads = 0;
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(async keys => {
      reads += 1;

      if (reads > 1) {
        throw new Error('An unexpected error occurred');
      }

      return realGet(keys);
    });
    const tripwire = installKeyConsoleTripwire();

    ensureUsableSigningKeyMaterial.mockResolvedValue(ENSURED);

    try {
      await expect(ensureSigningKeyRegistration()).resolves.toBeUndefined();
    } finally {
      tripwire.restore();
      get.mockRestore();
    }

    expect(reads).toBe(2);
    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
    expect(logsWithId(63).length).toBe(0);
    expect(tripwire.hits).toBe(0);
  });

  it('enqueues when the identity is unchanged', async () => {
    ensureUsableSigningKeyMaterial.mockResolvedValue(ENSURED);

    await ensureSigningKeyRegistration();

    expect(enqueueBrowserRegistration.mock.calls.length).toBe(1);
    expect(enqueueBrowserRegistration.mock.calls[0][0].op).toBe('update');
  });
});

describe('ensureSigningKeyRegistration — SIGNING_ACTIVE refusal', () => {
  it('is silent: no 63 and no enqueue', async () => {
    const refusal = new Error('Signing key unusable while signing is active; regeneration refused');

    refusal.code = SIGNING_ACTIVE;
    ensureUsableSigningKeyMaterial.mockRejectedValue(refusal);

    await expect(ensureSigningKeyRegistration()).resolves.toBeUndefined();

    expect(logsWithId(63).length).toBe(0);
    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
  });

  it('any other key-material failure still logs 63', async () => {
    ensureUsableSigningKeyMaterial.mockRejectedValue(new Error('IndexedDB unavailable'));

    await ensureSigningKeyRegistration();

    expect(logsWithId(63).length).toBe(1);
    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
  });
});

describe('ensureSigningKeyRegistration — a held key whose public half is unknown', () => {
  it('enqueues nothing: there is no key to register, and the held one is never replaced', async () => {
    ensureUsableSigningKeyMaterial.mockResolvedValue({ signingPublicKey: null, regenerated: false, registrable: false, persisted: false });

    await ensureSigningKeyRegistration();

    expect(enqueueBrowserRegistration.mock.calls.length).toBe(0);
    expect(logsWithId(63).length).toBe(0);
  });
});
