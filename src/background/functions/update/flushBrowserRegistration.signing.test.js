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

const createExtensionInstance = vi.fn();
const updateBrowserExtension = vi.fn();
vi.mock('@sdk/index.js', () => ({
  default: class SDK {
    createExtensionInstance (...args) { return createExtensionInstance(...args); }
    updateBrowserExtension (...args) { return updateBrowserExtension(...args); }
  }
}));

import browser from 'webextension-polyfill';
import storeLog from '@partials/storeLog.js';
import flushBrowserRegistration from './flushBrowserRegistration.js';
import enqueueBrowserRegistration from './enqueueBrowserRegistration.js';
import { REGISTRATION_STORAGE_KEY, REGISTRATION_ALARM_NAME } from './registrationRetryPolicy.js';
import { savePrivateKey } from '@background/functions/privateKeyStore.js';
import { generateSigningKeyMaterial, getSigningKey, saveSigningKey, signingKeyPairMatches } from '@background/functions/signing/signingKeyStore.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';
import { installKeyConsoleTripwire, longestSurvivor } from '@test/helpers/keySinks.js';
import { createFakeSigningBackend } from '@test/helpers/fakeSigningBackend.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

const seedRecord = record => saveToLocalStorage({
  [REGISTRATION_STORAGE_KEY]: {
    attempts: 0,
    firstAttemptAt: Date.now(),
    nextAttemptAt: Date.now(),
    reported: false,
    payload: { name: 'ext', browser_name: 'Chrome', browser_version: '1' },
    ...record
  }
});

const storedRecord = async () => (await loadFromLocalStorage(REGISTRATION_STORAGE_KEY))?.[REGISTRATION_STORAGE_KEY] || null;

const seedRSAKey = async () => {
  const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
  await savePrivateKey(pair.privateKey);
};

beforeEach(async () => {
  vi.clearAllMocks();
  await saveToLocalStorage({ nativePush: true });
});

describe('sendCreate — signing key registration', () => {
  it('includes public_signing_key in the POST and activates signing on success', async () => {
    await seedRSAKey();
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'pub', signingPublicKey: material.signingPublicKey } });
    await seedRecord({ op: 'create' });
    createExtensionInstance.mockResolvedValue({ id: 'new-id' });

    await flushBrowserRegistration();

    expect(createExtensionInstance).toHaveBeenCalledTimes(1);
    expect(createExtensionInstance.mock.calls[0][0].public_signing_key === material.signingPublicKey).toBe(true);

    const after = await loadFromLocalStorage(['extensionID', 'signing']);
    expect(after.extensionID).toBe('new-id');
    expect(after.signing).toMatchObject({ active: true, conflict: false, registrationRequired: false });
    expect(await storedRecord()).toBeNull();
  });

  it('generates a signing pair on the fly when none exists yet (create is always keyed)', async () => {
    await seedRSAKey();
    await saveToLocalStorage({ keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });
    createExtensionInstance.mockResolvedValue({ id: 'new-id' });

    await flushBrowserRegistration();

    const body = createExtensionInstance.mock.calls[0][0];
    expect(/^[A-Za-z0-9+/]+=*$/.test(body.public_signing_key)).toBe(true);
    expect(await getSigningKey()).toBeTruthy();
    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ active: true });
  });
});

describe('sendUpdate — signing key migration (≤1.8.4 → 1.9.0)', () => {
  const seedUpdateScenario = async (signing = { active: false, conflict: false }) => {
    const material = await generateSigningKeyMaterial();

    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: { name: 'ext', browser_name: 'Chrome', browser_version: '1' },
      keys: { publicKey: 'pub', signingPublicKey: material.signingPublicKey },
      signing
    });
    await seedRecord({ op: 'update' });

    return material;
  };

  it('attaches public_signing_key to the PUT while signing is inactive, and activates on success', async () => {
    const material = await seedUpdateScenario();
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    await flushBrowserRegistration();

    const [extID, payload] = updateBrowserExtension.mock.calls[0];
    expect(extID).toBe('ext-1');
    expect(payload.public_signing_key === material.signingPublicKey).toBe(true);

    const after = await loadFromLocalStorage(['signing', 'browserInfo']);
    expect(after.signing).toMatchObject({ active: true });
    // The committed browserInfo must NOT carry the signing key field.
    expect(after.browserInfo).toEqual({ name: 'ext', browser_name: 'Chrome', browser_version: '1' });
    expect(await storedRecord()).toBeNull();
  });

  it('sends a plain PUT (no key) once signing is already active', async () => {
    await seedUpdateScenario({ active: true, conflict: false });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    await flushBrowserRegistration();

    const [, payload] = updateBrowserExtension.mock.calls[0];
    expect(payload.public_signing_key === undefined).toBe(true);

    // Active state survives untouched.
    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ active: true });
  });

  it('sends a plain PUT (no key) in the conflict state', async () => {
    await seedUpdateScenario({ active: false, conflict: true });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    await flushBrowserRegistration();

    const [, payload] = updateBrowserExtension.mock.calls[0];
    expect(payload.public_signing_key === undefined).toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ active: false, conflict: true });
  });

  it('on 400 already-has-key: flags the conflict (log 64), keeps the record for a keyless retry', async () => {
    await seedUpdateScenario();
    updateBrowserExtension.mockRejectedValue({
      status: 400,
      statusText: 'Bad Request',
      content: { Code: 400, Description: 'browser extension already has public signing key: updating public signing key is not supported' }
    });

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(['signing']);
    expect(after.signing).toMatchObject({ active: false, conflict: true });
    expect(storeLog).toHaveBeenCalledWith('warning', 64, expect.anything(), expect.stringContaining('markSigningConflict'));

    const record = await storedRecord();
    expect(record).toMatchObject({ op: 'update', attempts: 0, reported: false });

    // Second flush: the PUT retries WITHOUT the key and commits normally.
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });
    await flushBrowserRegistration();

    const [, retryPayload] = updateBrowserExtension.mock.calls[1];
    expect(retryPayload.public_signing_key === undefined).toBe(true);
    expect(await storedRecord()).toBeNull();
    // Conflict is permanent — success without the key must not activate signing.
    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ active: false, conflict: true });
  });

  it('the conflict branch hands the failing record attempts and age to a key-free log 64', async () => {
    const material = await seedUpdateScenario();
    await seedRecord({ op: 'update', attempts: 2, firstAttemptAt: Date.now() - 2 * 60 * 60 * 1000 });
    updateBrowserExtension.mockRejectedValue({
      status: 400,
      statusText: 'Bad Request',
      url: 'https://api.example.test/browser_extensions/ext-1',
      signed: false,
      content: {
        Code: 400,
        Type: 'BadRequest',
        Description: 'Malformed request syntax.',
        Reason: `cannot update key from "server-held-label" to "${material.signingPublicKey}": browser extension already has public signing key: updating public signing key is not supported`
      }
    });

    await flushBrowserRegistration();

    const payloads = storeLog.mock.calls.filter(call => call[1] === 64).map(call => call[2]);
    expect(payloads.length).toBe(1);

    const [payload] = payloads;
    expect(longestSurvivor(JSON.stringify(payload), material.signingPublicKey)).toBe(0);
    expect('content' in payload).toBe(false);
    expect(payload.cause?.recordAttempts === 2).toBe(true);
    expect(payload.cause?.recordAgeBucket === '<1d').toBe(true);
    expect(await storedRecord()).toMatchObject({ op: 'update', attempts: 0, reported: false });
  });

  it('a non-sentinel 400 echoing the sent key logs 27 without backendContent', async () => {
    const material = await seedUpdateScenario();
    updateBrowserExtension.mockRejectedValue({
      status: 400,
      statusText: 'Bad Request',
      url: 'https://api.example.test/browser_extensions/ext-1',
      signed: false,
      content: { Code: 400, Type: 'BadRequest', Description: 'Malformed request syntax.', Reason: `invalid public_signing_key "${material.signingPublicKey}"` }
    });

    await flushBrowserRegistration();

    // The rejection really echoed the key that went out.
    expect(updateBrowserExtension.mock.calls[0][1].public_signing_key === material.signingPublicKey).toBe(true);

    const payloads = storeLog.mock.calls.filter(call => call[1] === 27).map(call => call[2]);
    expect(payloads.length).toBe(1);

    const [payload] = payloads;
    expect('backendContent' in payload).toBe(false);
    expect(payload.backendStatus === 400).toBe(true);
    expect(payload.backendStatusText === 'Bad Request').toBe(true);
    expect(typeof payload.backend === 'object' && payload.backend !== null).toBe(true);
    expect(payload.backend?.status === 400 && payload.backend?.type === 'BadRequest' && payload.backend?.reasonClass === 'other').toBe(true);
    expect(longestSurvivor(JSON.stringify(payload), material.signingPublicKey)).toBe(0);
    expect(await storedRecord()).toBeNull();
  });

  it('an unrelated 400 still drops the record (existing non-retryable path, no conflict flag)', async () => {
    await seedUpdateScenario();
    updateBrowserExtension.mockRejectedValue({ status: 400, statusText: 'Bad Request', content: 'name is blank' });

    await flushBrowserRegistration();

    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ conflict: false });
    expect(await storedRecord()).toBeNull();
  });

  it('a 401 while signing is still inactive drops the record — the request was unsigned, no clock to blame', async () => {
    await seedUpdateScenario();
    updateBrowserExtension.mockRejectedValue({
      status: 401,
      statusText: 'Unauthorized',
      url: 'https://api.example.test/browser_extensions/ext-1',
      content: '',
      signed: false
    });

    await flushBrowserRegistration();

    expect(await storedRecord()).toBeNull();
    expect(storeLog).toHaveBeenCalledWith('error', 27, expect.objectContaining({ backendStatus: 401 }), expect.stringContaining('non-retryable'));
  });

  it('a transient signing-key IndexedDB failure retries with backoff instead of dropping', async () => {
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: { name: 'ext', browser_name: 'Chrome', browser_version: '1' },
      keys: { publicKey: 'pub', signingPublicKey: 'existing-public' },
      signing: { active: false, conflict: false }
    });
    await seedRecord({ op: 'update' });
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    await flushBrowserRegistration();

    expect(updateBrowserExtension).not.toHaveBeenCalled();
    expect(await storedRecord()).toMatchObject({ op: 'update', attempts: 1 });
  });
});

describe('sendUpdate — 401 on the signed PUT (the backend holds another key, and never replaces one)', () => {
  // Clock skew is re-signed inside the SDK, so a signed 401 that reaches the
  // registration flow means the row verifies against a key this install does
  // not hold. Nothing a retry could change: it would only draw another
  // rejection (and another "signature verification failed" line on the backend).
  const UNAUTHORIZED = {
    status: 401,
    statusText: 'Unauthorized',
    url: 'https://api.example.test/browser_extensions/ext-1',
    content: '',
    signed: true
  };

  beforeEach(async () => {
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: { name: 'ext', browser_name: 'Chrome', browser_version: '139' },
      keys: { publicKey: 'pub', signingPublicKey: 'registered-public' },
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });
    await seedRecord({ op: 'update', payload: { name: 'ext', browser_name: 'Chrome', browser_version: '140' } });
  });

  it('drops the record, clears the alarm and logs 27 once', async () => {
    updateBrowserExtension.mockRejectedValue(UNAUTHORIZED);

    await flushBrowserRegistration();

    expect(updateBrowserExtension).toHaveBeenCalledTimes(1);
    expect(await storedRecord()).toBeNull();
    expect(await browser.alarms.get(REGISTRATION_ALARM_NAME)).toBeNull();
    expect(storeLog).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledWith('error', 27, expect.objectContaining({ backendStatus: 401 }), expect.stringContaining('non-retryable'));
  });

  it('never re-sends the PUT on a later flush', async () => {
    updateBrowserExtension.mockRejectedValue(UNAUTHORIZED);

    await flushBrowserRegistration();
    await flushBrowserRegistration();

    expect(updateBrowserExtension).toHaveBeenCalledTimes(1);
    expect((await loadFromLocalStorage('browserInfo')).browserInfo).toMatchObject({ browser_version: '139' });
  });
});

// Everything below compares keys only inside booleans or scans them with
// longestSurvivor; backend errors carry opaque labels, never a key.
const BROWSER_INFO = { name: 'ext', browser_name: 'Chrome', browser_version: '1' };
const INACTIVE_SIGNING = { active: false, conflict: false, registrationRequired: false, auth401Count: 0 };
const ACTIVE_SIGNING = { active: true, conflict: false, registrationRequired: false, auth401Count: 0 };
const NOT_FOUND = { status: 404, statusText: 'Not Found', content: '' };
const OPAQUE_CONFLICT = {
  status: 400,
  statusText: 'Bad Request',
  signed: false,
  content: {
    Code: 400,
    Type: 'BadRequest',
    Description: 'Malformed request syntax.',
    Reason: 'cannot update key from "key-1" to "key-2": browser extension already has public signing key: updating public signing key is not supported'
  }
};
const createRecord = () => ({
  op: 'create',
  payload: BROWSER_INFO,
  attempts: 0,
  firstAttemptAt: Date.now(),
  nextAttemptAt: Date.now(),
  reported: false
});

const logsWithId = id => storeLog.mock.calls.filter(call => call[1] === id);

const storedSigningPublicKey = async () => (await loadFromLocalStorage(['keys'])).keys?.signingPublicKey;

// SPKI of a throwaway pair whose private half is never stored.
const orphanSigningPublicKey = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  return Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
};

// A registered install upgraded from ≤1.8.4: no signing key yet; the flush generates it.
const seedUnkeyedUpdate = async (extra = {}) => {
  await saveToLocalStorage({ extensionID: 'ext-1', browserInfo: BROWSER_INFO, keys: { publicKey: 'pub' }, signing: INACTIVE_SIGNING, ...extra });
  await seedRecord({ op: 'update' });
};

// A registered install with a valid, stored signing pair.
const seedKeyedInstall = async signing => {
  const material = await generateSigningKeyMaterial();

  await saveToLocalStorage({
    extensionID: 'ext-1',
    browserInfo: BROWSER_INFO,
    keys: { publicKey: 'pub', signingPublicKey: material.signingPublicKey },
    signing
  });

  return material;
};

/** Runs `run` with a pass-through spy on storage.local.set and returns the written objects. */
const captureWrites = async run => {
  const set = vi.spyOn(browser.storage.local, 'set');

  try {
    await run();

    return set.mock.calls.map(call => call[0]);
  } finally {
    set.mockRestore();
  }
};

describe('registration commits — the cleared record and the activation land in one write', () => {
  it('keyed sendUpdate clears the record in the same write that activates signing', async () => {
    await seedKeyedInstall(INACTIVE_SIGNING);
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    const writes = await captureWrites(() => flushBrowserRegistration());
    const clears = writes.filter(arg => arg?.[REGISTRATION_STORAGE_KEY] === null);

    expect(clears.length).toBe(1);
    expect(clears[0].signing?.active === true).toBe(true);
    expect(typeof clears[0].extensionVersion === 'string').toBe(true);
    expect(clears[0].browserInfo?.browser_version === '1').toBe(true);
    expect(await storedRecord()).toBeNull();
  });

  it('a keyless sendUpdate clears the record with the browser info and leaves signing alone', async () => {
    await seedKeyedInstall(ACTIVE_SIGNING);
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    const writes = await captureWrites(() => flushBrowserRegistration());
    const clears = writes.filter(arg => arg?.[REGISTRATION_STORAGE_KEY] === null);

    expect(clears.length).toBe(1);
    expect('signing' in clears[0]).toBe(false);
    expect(typeof clears[0].extensionVersion === 'string').toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
  });

  it('sendCreate stores extensionID and activation in one write', async () => {
    await seedRSAKey();
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({ keys: { publicKey: 'pub', signingPublicKey: material.signingPublicKey } });
    await seedRecord({ op: 'create' });
    createExtensionInstance.mockResolvedValue({ id: 'new-id' });

    const writes = await captureWrites(() => flushBrowserRegistration());
    const commits = writes.filter(arg => arg?.extensionID === 'new-id');

    expect(commits.length).toBe(1);
    expect(commits[0].signing?.active === true).toBe(true);
    expect(commits[0][REGISTRATION_STORAGE_KEY] === null).toBe(true);
  });
});

describe('identity guards — a reset or self-heal racing a registration', () => {
  it('a failing identity read after a 2xx never re-POSTs', async () => {
    await seedRSAKey();
    await saveToLocalStorage({ keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });

    let posted = false;
    let failedReads = 0;
    createExtensionInstance.mockImplementation(async () => {
      posted = true;

      return { id: 'new-id' };
    });

    const realGet = browser.storage.local.get;
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(async keys => {
      if (posted && failedReads === 0 && Array.isArray(keys) && keys.includes('extensionID')) {
        failedReads += 1;
        throw new Error('An unexpected error occurred');
      }

      return realGet(keys);
    });
    const tripwire = installKeyConsoleTripwire();

    try {
      await flushBrowserRegistration();
      await flushBrowserRegistration();
    } finally {
      tripwire.restore();
      get.mockRestore();
    }

    expect(failedReads).toBe(1);
    expect(createExtensionInstance.mock.calls.length).toBe(1);
    expect((await loadFromLocalStorage(['extensionID'])).extensionID === 'new-id').toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect(tripwire.hits).toBe(0);
  });

  it('identity replaced during a keyed PUT: the failure does not touch the new identity', async () => {
    await seedKeyedInstall(INACTIVE_SIGNING);
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockImplementation(async () => {
      // The reset (or heal) registered a fresh identity while the PUT was out.
      await saveToLocalStorage({
        extensionID: 'ext-2',
        keys: { publicKey: 'pub-2' },
        signing: ACTIVE_SIGNING,
        [REGISTRATION_STORAGE_KEY]: null
      });

      return Promise.reject(OPAQUE_CONFLICT);
    });

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(['signing', 'extensionID']);

    expect(logsWithId(64).length).toBe(0);
    expect(after.signing?.active === true && after.signing?.conflict === false).toBe(true);
    expect(after.extensionID === 'ext-2').toBe(true);
    expect(await storedRecord()).toBeNull();
  });

  it("identity replaced during a PUT: success keeps the new identity's create record", async () => {
    await seedKeyedInstall(INACTIVE_SIGNING);
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockImplementation(async () => {
      // The reset cleared the identity; its own registration is still pending.
      await browser.storage.local.remove('extensionID');
      await saveToLocalStorage({ keys: { publicKey: 'pub-2' }, signing: INACTIVE_SIGNING, [REGISTRATION_STORAGE_KEY]: createRecord() });

      return { id: 'ext-1' };
    });

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(['signing', 'extensionVersion']);

    expect((await storedRecord())?.op === 'create').toBe(true);
    expect(after.signing?.active === true).toBe(false);
    expect(after.extensionVersion === undefined).toBe(true);
  });

  it('identity replaced while the key was being generated: nothing is sent', async () => {
    await seedUnkeyedUpdate();
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    const realGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    const generateKey = vi.spyOn(crypto.subtle, 'generateKey').mockImplementation(async (...args) => {
      if (args[0]?.name === 'ECDSA') {
        await browser.storage.local.clear();
        await browser.storage.local.set({ attempt: 1, keys: { publicKey: 'pub-2' }, [REGISTRATION_STORAGE_KEY]: createRecord() });
      }

      return realGenerateKey(...args);
    });

    try {
      await flushBrowserRegistration();
    } finally {
      generateKey.mockRestore();
    }

    const after = await loadFromLocalStorage(null);

    expect(updateBrowserExtension.mock.calls.length).toBe(0);
    expect((await storedRecord())?.op === 'create').toBe(true);
    expect(after.signing === undefined && after.extensionID === undefined).toBe(true);
    expect('signingKeySends' in after).toBe(false);
  });

  it('a pass ended by an identity change re-arms the retry alarm for a create the new identity queued meanwhile', async () => {
    await seedRSAKey();
    await seedKeyedInstall(INACTIVE_SIGNING);
    await seedRecord({ op: 'update' });
    await browser.alarms.clearAll();

    // The network-shaped rejection SDK.onError makes of a failed fetch.
    const FETCH_FAILED = { name: 'TypeError', message: 'Failed to fetch' };
    let joined = null;
    updateBrowserExtension.mockImplementation(async () => {
      // storageReset while the PUT is out: a fresh identity whose own POST failed
      // transiently. Its enqueue stored a create record, and its flush call
      // joined this pass instead of starting one.
      const material = await generateSigningKeyMaterial();

      await browser.storage.local.clear();
      await saveToLocalStorage({
        attempt: 1,
        keys: { publicKey: 'pub-2', signingPublicKey: material.signingPublicKey },
        [REGISTRATION_STORAGE_KEY]: createRecord()
      });
      joined = flushBrowserRegistration();

      return Promise.reject(FETCH_FAILED);
    });

    const flushing = flushBrowserRegistration();
    await flushing;

    expect(joined === flushing).toBe(true);

    const queued = await storedRecord();
    expect(queued?.op === 'create' && queued?.attempts === 0).toBe(true);
    expect(Boolean(await browser.alarms.get(REGISTRATION_ALARM_NAME))).toBe(true);

    // The alarm fires: the create gets its attempt.
    createExtensionInstance.mockResolvedValue({ id: 'ext-2' });
    await flushBrowserRegistration();

    expect(createExtensionInstance.mock.calls.length).toBe(1);
    expect((await loadFromLocalStorage(['extensionID'])).extensionID === 'ext-2').toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect((await browser.alarms.get(REGISTRATION_ALARM_NAME)) === null).toBe(true);
  });

  // An IndexedDB whose open fails only after a reset replaced the identity: the
  // key read of the old identity's pass throws while the new identity waits.
  const indexedDBFailingAfter = replaceIdentity => ({
    open: () => {
      const request = {};

      replaceIdentity().then(() => {
        request.error = new Error('IndexedDB unavailable');
        request.onerror?.();
      });

      return request;
    }
  });

  const NEW_IDENTITY_CREATE = () => ({ ...createRecord(), payload: { ...BROWSER_INFO, name: 'ext-2' } });

  it("a key-material failure while a reset replaces the identity leaves the new identity's create record alone (update)", async () => {
    await seedKeyedInstall(INACTIVE_SIGNING);
    await seedRecord({ op: 'update' });
    globalThis.indexedDB = indexedDBFailingAfter(async () => {
      await browser.storage.local.clear();
      await saveToLocalStorage({ attempt: 1, keys: { publicKey: 'pub-2' }, [REGISTRATION_STORAGE_KEY]: NEW_IDENTITY_CREATE() });
    });

    await flushBrowserRegistration();

    const queued = await storedRecord();

    expect(updateBrowserExtension.mock.calls.length).toBe(0);
    expect(queued?.op === 'create' && queued?.payload?.name === 'ext-2').toBe(true);
    expect(Boolean(await browser.alarms.get(REGISTRATION_ALARM_NAME))).toBe(true);
  });

  it("a private-key read failure while a reset replaces the identity leaves the new identity's create record alone (create)", async () => {
    await saveToLocalStorage({ browserInfo: BROWSER_INFO, keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });
    globalThis.indexedDB = indexedDBFailingAfter(async () => {
      await browser.storage.local.clear();
      await saveToLocalStorage({ attempt: 1, keys: { publicKey: 'pub-2' }, [REGISTRATION_STORAGE_KEY]: NEW_IDENTITY_CREATE() });
    });

    await flushBrowserRegistration();

    const queued = await storedRecord();

    expect(createExtensionInstance.mock.calls.length).toBe(0);
    expect(queued?.payload?.name === 'ext-2' && queued?.attempts === 0).toBe(true);
  });
});

describe('sendUpdate — SIGNING_ACTIVE refusal', () => {
  it('a regeneration refused because signing turned active downgrades to a keyless PUT in the same pass', async () => {
    const orphan = await orphanSigningPublicKey();
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: BROWSER_INFO,
      keys: { publicKey: 'pub', signingPublicKey: orphan },
      signing: ACTIVE_SIGNING
    });
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    // The flush read signing before it turned active; the key material sees it active.
    const realGet = browser.storage.local.get;
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(async keys => {
      const result = await realGet(keys);

      if (Array.isArray(keys) && keys.includes('browserInfo') && keys.includes('signing')) {
        return { ...result, signing: INACTIVE_SIGNING };
      }

      return result;
    });

    try {
      await flushBrowserRegistration();
    } finally {
      get.mockRestore();
    }

    expect(updateBrowserExtension.mock.calls.length).toBe(1);
    expect('public_signing_key' in updateBrowserExtension.mock.calls[0][1]).toBe(false);
    expect(await storedRecord()).toBeNull();
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(((await storedSigningPublicKey()) === orphan) === true).toBe(true);
    expect((await getSigningKey()) === undefined).toBe(true);
    expect(logsWithId(27).length + logsWithId(63).length + logsWithId(74).length).toBe(0);
  });
});

describe('sendUpdate — a signing key that is not stored is never sent', () => {
  it('storage without an RSA identity gets a keyless PUT and no activation', async () => {
    // Registered, but the RSA identity is missing from storage.local (a cleared
    // or damaged profile): there is nothing to store a signing key next to.
    await saveToLocalStorage({ extensionID: 'ext-1', browserInfo: BROWSER_INFO, signing: INACTIVE_SIGNING });
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(null);

    expect(updateBrowserExtension.mock.calls.length).toBe(1);
    expect('public_signing_key' in updateBrowserExtension.mock.calls[0][1]).toBe(false);
    expect(after.signing?.active === true).toBe(false);
    expect(after.keys === undefined && !('signingKeySends' in after)).toBe(true);
    expect(await storedRecord()).toBeNull();
  });
});

describe('sendCreate — re-registration while signing is active', () => {
  const seedActiveUpdateThat404s = async signingPublicKey => {
    await seedRSAKey();
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: BROWSER_INFO,
      keys: { publicKey: 'pub', signingPublicKey },
      signing: ACTIVE_SIGNING
    });
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockRejectedValue(NOT_FOUND);
    createExtensionInstance.mockResolvedValue({ id: 'fresh-id' });
  };

  it('reuses the pair-verified key', async () => {
    const material = await generateSigningKeyMaterial();
    await seedActiveUpdateThat404s(material.signingPublicKey);

    await flushBrowserRegistration();

    expect((await storedRecord())?.reregister === true).toBe(true);

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(['extensionID', 'signing']);

    expect(createExtensionInstance.mock.calls.length).toBe(1);
    expect(createExtensionInstance.mock.calls[0][0].public_signing_key === material.signingPublicKey).toBe(true);
    expect(after.extensionID === 'fresh-id' && after.signing?.active === true).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect(logsWithId(63).length + logsWithId(74).length).toBe(0);
  });

  it('registers a regenerated key when the stored one is unusable (the new row holds no key yet)', async () => {
    const orphan = await orphanSigningPublicKey();
    await seedActiveUpdateThat404s(orphan);

    await flushBrowserRegistration();
    await flushBrowserRegistration();

    const sent = createExtensionInstance.mock.calls[0]?.[0]?.public_signing_key;
    const stored = await storedSigningPublicKey();

    expect(createExtensionInstance.mock.calls.length).toBe(1);
    expect((sent === orphan) === false).toBe(true);
    expect((sent === stored) === true).toBe(true);
    expect(await signingKeyPairMatches(stored, await getSigningKey())).toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(await storedRecord()).toBeNull();
  });
});

describe('keyed send counter and log 64 diagnostics', () => {
  let backend;

  beforeEach(() => {
    backend = createFakeSigningBackend();
    updateBrowserExtension.mockImplementation((...args) => backend.updateBrowserExtension(...args));
    createExtensionInstance.mockImplementation((...args) => backend.createExtensionInstance(...args));
  });

  const storedSends = async () => (await loadFromLocalStorage(['signingKeySends'])).signingKeySends;

  it('each keyed request counts one send; a keyless PUT counts none', async () => {
    backend.seedExtension('ext-1');
    await seedUnkeyedUpdate();

    await flushBrowserRegistration();

    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(await storedSends()).toBe(1);

    await seedRecord({ op: 'update' });
    await flushBrowserRegistration();

    expect(backend.requests).toBe(2);
    expect(backend.keyedRequests).toBe(1);
    expect(await storedSends()).toBe(1);
  });

  it('first-ever send of a freshly generated key that conflicts reports keyGenerations 1 and sendsWithThisKey 0', async () => {
    // Another copy of this identity (cloned or rolled-back profile) set its key first.
    backend.seedExtension('ext-1', { signingKey: 'set-by-another-copy' });
    await seedUnkeyedUpdate({ extensionVersion: '1.9.0' });

    await flushBrowserRegistration();

    const payloads = logsWithId(64).map(call => call[2]);

    expect(backend.conflicts).toBe(1);
    expect(payloads.length).toBe(1);

    const { cause } = payloads[0];

    expect(cause?.keyGenerations === 1 && cause?.sendsWithThisKey === 0).toBe(true);
    expect(cause?.recordAttempts === 0).toBe(true);
    expect(cause?.keyAgeBucket === '<1m' && cause?.recordAgeBucket === '<1m').toBe(true);
    expect(cause?.storedExtensionVersion === '1.9.0').toBe(true);
    expect(longestSurvivor(JSON.stringify(payloads[0]), await storedSigningPublicKey())).toBe(0);
    expect(await storedSends()).toBe(1);
  });

  it('a re-send reports the sends made before it, not the counter after it', async () => {
    backend.seedExtension('ext-1');
    await seedUnkeyedUpdate();
    // Lost before reaching the backend (nothing committed).
    updateBrowserExtension.mockRejectedValueOnce({ name: 'TypeError', message: 'Failed to fetch' });

    await flushBrowserRegistration();

    expect(backend.requests).toBe(0);
    expect((await storedRecord())?.attempts === 1).toBe(true);

    backend.seedExtension('ext-1', { signingKey: 'set-by-another-copy' });

    await flushBrowserRegistration();

    const payloads = logsWithId(64).map(call => call[2]);

    expect(payloads.length).toBe(1);
    expect(payloads[0].cause?.keyGenerations === 1 && payloads[0].cause?.sendsWithThisKey === 1).toBe(true);
    expect(payloads[0].cause?.recordAttempts === 1).toBe(true);
    expect(await storedSends()).toBe(2);
  });

  it('a failing counter write never blocks the keyed request', async () => {
    backend.seedExtension('ext-1');
    await seedUnkeyedUpdate();

    let failedWrites = 0;
    const realSet = browser.storage.local.set;
    const set = vi.spyOn(browser.storage.local, 'set').mockImplementation(async data => {
      if (data && 'signingKeySends' in data && !('keys' in data)) {
        failedWrites += 1;
        throw new Error('QUOTA_BYTES quota exceeded');
      }

      return realSet(data);
    });
    const tripwire = installKeyConsoleTripwire();

    try {
      await flushBrowserRegistration();
    } finally {
      tripwire.restore();
      set.mockRestore();
    }

    expect(failedWrites).toBe(1);
    expect(backend.keyedRequests).toBe(1);
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect(tripwire.hits).toBe(0);
  });

  it('a key from before the lineage counters, regenerated before its conflicting PUT, reports keyGenerations 2, not a first key', async () => {
    // The backend holds what the earlier release sent; that release left a
    // public key without its private half and wrote no lineage counters.
    backend.seedExtension('ext-1', { signingKey: 'sent-by-an-earlier-release' });
    await seedUnkeyedUpdate({ keys: { publicKey: 'pub', signingPublicKey: await orphanSigningPublicKey() }, extensionVersion: '1.8.4' });

    await flushBrowserRegistration();

    const payloads = logsWithId(64).map(call => call[2]);

    expect(logsWithId(74).length).toBe(1);
    expect(backend.conflicts).toBe(1);
    expect(payloads.length).toBe(1);
    expect(payloads[0].cause?.keyGenerations === 2 && payloads[0].cause?.sendsWithThisKey === 0).toBe(true);
    expect(payloads[0].cause?.storedExtensionVersion === '1.8.4').toBe(true);
  });
});

describe('conflict retry — the key is never re-sent', () => {
  let backend;

  beforeEach(() => {
    backend = createFakeSigningBackend();
    updateBrowserExtension.mockImplementation((...args) => backend.updateBrowserExtension(...args));
    createExtensionInstance.mockImplementation((...args) => backend.createExtensionInstance(...args));
  });

  /**
   * Runs `run` while every strict signing-state read fails. In these flows only
   * markSigningConflict reads 'signing' as a single key, so the conflict flag
   * cannot be stored. Swallows the console output of the failed reads.
   * @return {Promise<{failedReads: number, hits: number}>}
   */
  const withFailingSigningStateRead = async run => {
    let failedReads = 0;
    const realGet = browser.storage.local.get;
    const get = vi.spyOn(browser.storage.local, 'get').mockImplementation(async keys => {
      if (keys === 'signing') {
        failedReads += 1;
        throw new Error('An unexpected error occurred');
      }

      return realGet(keys);
    });
    const tripwire = installKeyConsoleTripwire();

    try {
      await run();
    } finally {
      tripwire.restore();
      get.mockRestore();
    }

    return { failedReads, hits: tripwire.hits };
  };

  it('a conflict whose flag could not be stored retries keyless: one keyed PUT, then the browser info commits', async () => {
    // Another copy of this identity set its key first.
    backend.seedExtension('ext-1', { signingKey: 'set-by-another-copy' });
    await seedUnkeyedUpdate();

    const first = await withFailingSigningStateRead(() => flushBrowserRegistration());
    const record = await storedRecord();

    expect(first.failedReads).toBe(1);
    expect(backend.keyedRequests === 1 && backend.conflicts === 1).toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.conflict === true).toBe(false);
    expect(record?.op === 'update' && record?.attempts === 0).toBe(true);
    expect(record?.keyless === true).toBe(true);

    const second = await withFailingSigningStateRead(() => flushBrowserRegistration());

    expect(backend.requests).toBe(2);
    expect('public_signing_key' in updateBrowserExtension.mock.calls[1][1]).toBe(false);
    expect(backend.keyedRequests).toBe(1);
    expect(second.failedReads).toBe(0);
    expect(await storedRecord()).toBeNull();
    expect((await loadFromLocalStorage(['signing'])).signing?.active === true).toBe(false);
    expect(first.hits + second.hits).toBe(0);
  });

  it('a stored conflict marks the retry keyless in the same record write that resets attempts', async () => {
    backend.seedExtension('ext-1', { signingKey: 'set-by-another-copy' });
    await seedUnkeyedUpdate();

    const writes = await captureWrites(() => flushBrowserRegistration());
    const retries = writes.map(arg => arg?.[REGISTRATION_STORAGE_KEY]).filter(written => written?.keyless === true);

    expect(retries.length).toBe(1);
    expect(retries[0].attempts === 0 && retries[0].reported === false).toBe(true);
    expect(Number.isFinite(retries[0].nextAttemptAt)).toBe(true);
    expect((await loadFromLocalStorage(['signing'])).signing?.conflict === true).toBe(true);
    expect(logsWithId(64).length).toBe(1);

    await flushBrowserRegistration();

    const signing = (await loadFromLocalStorage(['signing'])).signing;

    expect(backend.requests === 2 && backend.keyedRequests === 1).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect(signing?.active === false && signing?.conflict === true).toBe(true);
    expect(logsWithId(64).length).toBe(1);
  });

  it('a keyless retry stays keyless when a new update merges into its record, and its pass never touches the key material', async () => {
    await seedUnkeyedUpdate();
    await seedRecord({ op: 'update', keyless: true, attempts: 2 });
    // Lost before reaching the backend: the merged record stays pending.
    updateBrowserExtension.mockRejectedValueOnce({ name: 'TypeError', message: 'Failed to fetch' });

    await enqueueBrowserRegistration({ op: 'update', payload: { ...BROWSER_INFO, browser_version: '2' } });

    const record = await storedRecord();

    expect(record?.keyless === true).toBe(true);
    expect(record?.attempts === 3 && record?.payload?.browser_version === '2').toBe(true);
    expect(updateBrowserExtension.mock.calls.length).toBe(1);
    expect('public_signing_key' in updateBrowserExtension.mock.calls[0][1]).toBe(false);
    expect(updateBrowserExtension.mock.calls[0][1].browser_version === '2').toBe(true);
    // No key was generated for a PUT that never carries one.
    expect((await storedSigningPublicKey()) === undefined).toBe(true);
    expect('signingKeySends' in (await loadFromLocalStorage(null))).toBe(false);
  });

  it('a new registration episode after the keyless commit starts keyed: at most one keyed PUT per episode while the conflict cannot be stored', async () => {
    backend.seedExtension('ext-1', { signingKey: 'set-by-another-copy' });
    await seedUnkeyedUpdate();

    const run = await withFailingSigningStateRead(async () => {
      await flushBrowserRegistration();
      await flushBrowserRegistration();

      expect(await storedRecord()).toBeNull();
      expect(backend.keyedRequests).toBe(1);

      // A browser update starts a new episode with a fresh record (no flag): one
      // keyed PUT, which conflicts again and marks this record keyless.
      await enqueueBrowserRegistration({ op: 'update', payload: { ...BROWSER_INFO, browser_version: '2' } });

      expect(backend.keyedRequests === 2 && backend.conflicts === 2).toBe(true);
      expect((await storedRecord())?.keyless === true).toBe(true);

      await flushBrowserRegistration();
    });

    expect(run.failedReads).toBe(2);
    expect(backend.requests === 4 && backend.keyedRequests === 2).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect((await loadFromLocalStorage(['browserInfo'])).browserInfo?.browser_version === '2').toBe(true);
    expect(run.hits).toBe(0);
  });

  it('a 404 on a keyless retry converts to a create record without the flag, and the POST carries the key', async () => {
    await seedRSAKey();
    // The backend has no row for ext-1: the PUT answers 404.
    const material = await seedKeyedInstall(INACTIVE_SIGNING);
    await seedRecord({ op: 'update', keyless: true });

    await flushBrowserRegistration();

    const record = await storedRecord();

    expect(backend.requests).toBe(1);
    expect('public_signing_key' in updateBrowserExtension.mock.calls[0][1]).toBe(false);
    expect(record?.op === 'create' && record?.reregister === true && record?.attempts === 0).toBe(true);
    expect(record !== null && !('keyless' in record)).toBe(true);

    await flushBrowserRegistration();

    const after = await loadFromLocalStorage(['extensionID', 'signing']);

    expect(createExtensionInstance.mock.calls.length).toBe(1);
    expect((createExtensionInstance.mock.calls[0][0].public_signing_key === material.signingPublicKey) === true).toBe(true);
    expect(backend.keyedRequests).toBe(1);
    expect(after.extensionID === 'fake-ext-1' && after.signing?.active === true).toBe(true);
    expect(await storedRecord()).toBeNull();
  });
});

describe('sendUpdate — a held signing key whose public half was lost (1.9.1)', () => {
  it('recovers the public half, sends it with the PUT and activates on success', async () => {
    const survivor = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const survivorSpki = Buffer.from(await crypto.subtle.exportKey('spki', survivor.publicKey)).toString('base64');
    await saveSigningKey(survivor.privateKey);
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: { name: 'ext', browser_name: 'Chrome', browser_version: '139' },
      keys: { publicKey: 'pub' },
      signing: INACTIVE_SIGNING,
      signingKeySends: 0
    });
    await seedRecord({ op: 'update', payload: { name: 'ext', browser_name: 'Chrome', browser_version: '140' } });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    await flushBrowserRegistration();

    const [, payload] = updateBrowserExtension.mock.calls[0];
    expect(payload.public_signing_key === survivorSpki).toBe(true);

    const after = await loadFromLocalStorage(['signing', 'browserInfo', 'signingKeySends', 'keys']);
    expect(after.signing).toMatchObject({ active: true, conflict: false });
    expect(after.browserInfo).toMatchObject({ browser_version: '140' });
    expect(after.signingKeySends).toBe(1);
    expect(after.keys.signingPublicKey === survivorSpki).toBe(true);
    expect(await storedRecord()).toBeNull();
    expect(storeLog).toHaveBeenCalledWith('warning', 75, expect.anything(), expect.anything());
    expect(storeLog).not.toHaveBeenCalledWith('warning', 74, expect.anything(), expect.anything());
  });
});
