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

// Recovery of the signing-key registration across lost responses and local key
// loss, end to end through the real key store (fake IndexedDB) against a fake
// backend that keeps a per-extension key column. Every key is generated at
// runtime and only ever compared inside a boolean, or scanned with longestSurvivor.

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@notification/index.js', () => ({ default: { show: vi.fn().mockResolvedValue(undefined) } }));

let backend;
vi.mock('@sdk/index.js', () => ({
  default: class SDK {
    createExtensionInstance (...args) { return backend.createExtensionInstance(...args); }
    updateBrowserExtension (...args) { return backend.updateBrowserExtension(...args); }
  }
}));

import browser from 'webextension-polyfill';
import storeLog from '@partials/storeLog.js';
import flushBrowserRegistration from './flushBrowserRegistration.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import { deleteSigningKey, getSigningKey, signingKeyPairMatches } from '@background/functions/signing/signingKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { longestSurvivor } from '@test/helpers/keySinks.js';
import { createFakeSigningBackend } from '@test/helpers/fakeSigningBackend.js';

const BROWSER_INFO = { name: 'ext', browser_name: 'Chrome', browser_version: '1' };
const INACTIVE_SIGNING = { active: false, conflict: false, registrationRequired: false, auth401Count: 0 };

const logsWithId = id => storeLog.mock.calls.filter(call => call[1] === id);

const storedRecord = async () => (await loadFromLocalStorage(REGISTRATION_STORAGE_KEY))?.[REGISTRATION_STORAGE_KEY] || null;

const storedSigningPublicKey = async () => (await loadFromLocalStorage(['keys'])).keys?.signingPublicKey;

const recordFor = op => ({
  op,
  payload: BROWSER_INFO,
  attempts: 0,
  firstAttemptAt: Date.now(),
  nextAttemptAt: Date.now(),
  reported: false
});

// A registered install upgraded from ≤1.8.4: no signing key yet, a pending
// update that will carry the first one.
const seedMigratingInstall = () => saveToLocalStorage({
  extensionID: 'ext-1',
  browserInfo: BROWSER_INFO,
  keys: { publicKey: 'rsa-pub' },
  signing: INACTIVE_SIGNING,
  [REGISTRATION_STORAGE_KEY]: recordFor('update')
});

beforeEach(async () => {
  vi.clearAllMocks();
  backend = createFakeSigningBackend();
  backend.seedExtension('ext-1');
  await seedMigratingInstall();
});

describe('flushBrowserRegistration — M3 lost response', () => {
  it('re-sends the same key after a committed request lost its response', async () => {
    backend.commitThenAbort(1);

    await flushBrowserRegistration();

    expect(backend.lostResponses).toBe(1);
    expect(backend.holdsSigningKey('ext-1')).toBe(true);
    expect((await storedRecord())?.attempts === 1).toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(false);

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(['signing']);

    expect(backend.keyedRequests).toBe(2);
    expect(backend.sentMatchedStored === true).toBe(true);
    expect(backend.holdsSameSigningKey('ext-1', await storedSigningPublicKey())).toBe(true);
    expect(after.signing?.active === true && after.signing?.conflict === false).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect(logsWithId(64).length).toBe(0);
  });

  it('M3 + M2(d): a lost response then a lost keys.signingPublicKey recovers from the IndexedDB record', async () => {
    backend.commitThenAbort(1);

    await flushBrowserRegistration();

    // A crash rolled storage.local back past the key write; IndexedDB kept the pair and its companion.
    await saveToLocalStorage({ keys: { publicKey: 'rsa-pub' } });

    await flushBrowserRegistration();

    expect(backend.sentMatchedStored === true).toBe(true);
    expect(backend.holdsSameSigningKey('ext-1', await storedSigningPublicKey())).toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(logsWithId(75).length).toBe(1);
    expect(logsWithId(74).length).toBe(0);
    expect(logsWithId(64).length).toBe(0);
  });

  it('a key regenerated after a lost response conflicts with keyGenerations 2 in log 64', async () => {
    backend.commitThenAbort(1);

    await flushBrowserRegistration();

    const sentFirst = await storedSigningPublicKey();

    // The private half is gone (IndexedDB loss): 1.9.1 regenerates while unregistered.
    await deleteSigningKey();

    await flushBrowserRegistration();

    const regenerated = await storedSigningPublicKey();
    const payloads = logsWithId(64).map(call => call[2]);

    expect(backend.conflicts).toBe(1);
    expect((regenerated === sentFirst) === false).toBe(true);
    expect(await signingKeyPairMatches(regenerated, await getSigningKey())).toBe(true);
    expect(logsWithId(74).length).toBe(1);
    expect(logsWithId(74)[0][2].cause?.reason === 'privateMissing').toBe(true);
    expect(payloads.length).toBe(1);
    expect(payloads[0].cause?.keyGenerations === 2).toBe(true);
    expect(payloads[0].cause?.sendsWithThisKey === 0).toBe(true);
    expect(payloads[0].cause?.recordAttempts === 1).toBe(true);
    expect(longestSurvivor(JSON.stringify(payloads[0]), sentFirst)).toBe(0);
    expect(longestSurvivor(JSON.stringify(payloads[0]), regenerated)).toBe(0);
    expect((await loadFromLocalStorage(['signingKeySends'])).signingKeySends).toBe(1);
    expect((await loadFromLocalStorage(['signing'])).signing?.conflict === true).toBe(true);
  });
});

describe('flushBrowserRegistration — M7 reset during an in-flight keyed PUT', () => {
  it('a reset landing while the PUT is held leaves the new identity alone when the PUT succeeds', async () => {
    const held = backend.deferNext();
    const flushing = flushBrowserRegistration();

    await held.reached;

    // storageReset: clear, attempt counter, fresh RSA identity, create still pending.
    await browser.storage.local.clear();
    await saveToLocalStorage({ attempt: 1, keys: { publicKey: 'rsa-pub-2' }, [REGISTRATION_STORAGE_KEY]: recordFor('create') });

    held.release();
    await flushing;

    const after = await loadFromLocalStorage(null);

    // The old identity's PUT did land server-side; nothing of it is committed locally.
    expect(backend.holdsSigningKey('ext-1')).toBe(true);
    expect((await storedRecord())?.op === 'create').toBe(true);
    expect(after.signing === undefined && after.extensionID === undefined && after.browserInfo === undefined).toBe(true);
    expect('signingKeySends' in after).toBe(false);
    expect(logsWithId(64).length).toBe(0);
  });
});
