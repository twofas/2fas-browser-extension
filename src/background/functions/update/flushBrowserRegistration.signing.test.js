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
import { REGISTRATION_STORAGE_KEY, REGISTRATION_ALARM_NAME, MAX_ATTEMPTS_BEFORE_ESCALATE } from './registrationRetryPolicy.js';
import { savePrivateKey } from '@background/functions/privateKeyStore.js';
import { generateSigningKeyMaterial, getSigningKey } from '@background/functions/signing/signingKeyStore.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';

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
    expect(createExtensionInstance.mock.calls[0][0].public_signing_key).toBe(material.signingPublicKey);

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
    expect(body.public_signing_key).toMatch(/^[A-Za-z0-9+/]+=*$/);
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
    expect(payload.public_signing_key).toBe(material.signingPublicKey);

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
    expect(payload.public_signing_key).toBeUndefined();

    // Active state survives untouched.
    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ active: true });
  });

  it('sends a plain PUT (no key) in the conflict state', async () => {
    await seedUpdateScenario({ active: false, conflict: true });
    updateBrowserExtension.mockResolvedValue({ id: 'ext-1' });

    await flushBrowserRegistration();

    const [, payload] = updateBrowserExtension.mock.calls[0];
    expect(payload.public_signing_key).toBeUndefined();
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
    expect(retryPayload.public_signing_key).toBeUndefined();
    expect(await storedRecord()).toBeNull();
    // Conflict is permanent — success without the key must not activate signing.
    expect((await loadFromLocalStorage(['signing'])).signing).toMatchObject({ active: false, conflict: true });
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

describe('sendUpdate — 401 on the signed PUT', () => {
  // A signed 401 is not a verdict on the request: a clock the SDK could not
  // correct, or a nonce-store hiccup, rejects it just the same. Dropping the
  // record abandoned the browser-info update until the next browser update.
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

  it('keeps the record and schedules a backoff retry without reporting it as stuck', async () => {
    updateBrowserExtension.mockRejectedValue(UNAUTHORIZED);

    await flushBrowserRegistration();

    expect(await storedRecord()).toMatchObject({ op: 'update', attempts: 1, reported: false });
    expect(await browser.alarms.get(REGISTRATION_ALARM_NAME)).toBeTruthy();
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('delivers the update on a later flush once the backend accepts it', async () => {
    updateBrowserExtension
      .mockRejectedValueOnce(UNAUTHORIZED)
      .mockResolvedValueOnce({ id: 'ext-1' });

    await flushBrowserRegistration();
    await flushBrowserRegistration();

    expect(updateBrowserExtension).toHaveBeenCalledTimes(2);
    expect(await storedRecord()).toBeNull();
    expect((await loadFromLocalStorage('browserInfo')).browserInfo).toMatchObject({ browser_version: '140' });
  });

  it('reports a signed PUT still rejected at the escalation threshold as stuck, once (log 27)', async () => {
    await seedRecord({
      op: 'update',
      attempts: MAX_ATTEMPTS_BEFORE_ESCALATE - 1,
      payload: { name: 'ext', browser_name: 'Chrome', browser_version: '140' }
    });
    updateBrowserExtension.mockRejectedValue(UNAUTHORIZED);

    await flushBrowserRegistration();

    expect(storeLog).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledWith('error', 27, expect.objectContaining({ backendStatus: 401 }), expect.stringContaining('stuck'));
    expect(await storedRecord()).toMatchObject({ attempts: MAX_ATTEMPTS_BEFORE_ESCALATE, reported: true });
  });

  it('drops the record when the rejected PUT went out unsigned because the signing key was unavailable', async () => {
    updateBrowserExtension.mockRejectedValue({ ...UNAUTHORIZED, signed: false });

    await flushBrowserRegistration();

    expect(await storedRecord()).toBeNull();
  });

  it('stops retrying once registrationRequired is set — the backend rejects this install for good', async () => {
    await saveToLocalStorage({ signing: { active: true, conflict: false, registrationRequired: true, auth401Count: 3 } });
    updateBrowserExtension.mockRejectedValue(UNAUTHORIZED);

    await flushBrowserRegistration();

    expect(await storedRecord()).toBeNull();
    expect(storeLog).toHaveBeenCalledWith('error', 27, expect.objectContaining({ backendStatus: 401 }), expect.stringContaining('non-retryable'));
  });
});
