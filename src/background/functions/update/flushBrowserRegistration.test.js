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

const openInstallPage = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/openInstallPage.js', () => ({ default: (...a) => openInstallPage(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

import flushBrowserRegistration from './flushBrowserRegistration.js';
import { RECOVERED_PAGE_PENDING_KEY } from '@partials/installPageReasons.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import { savePrivateKey } from '@background/functions/privateKeyStore.js';
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('flushBrowserRegistration — sendCreate private-key guard', () => {
  it('registers and commits the extensionID when the private key exists', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });
    createExtensionInstance.mockResolvedValue({ id: 'new-id' });

    await flushBrowserRegistration();

    expect(createExtensionInstance).toHaveBeenCalledTimes(1);
    const after = await loadFromLocalStorage(['extensionID']);
    expect(after.extensionID).toBe('new-id');
    expect(await storedRecord()).toBeNull();
  });

  it('drops the record WITHOUT registering when the private key is gone', async () => {
    // Committing an extensionID whose private half no longer exists would lock
    // the install into the missing-private-key state (log 57) instead of leaving
    // a regenerable incomplete one.
    await saveToLocalStorage({ keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });

    await flushBrowserRegistration();

    expect(createExtensionInstance).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBeUndefined();
    expect(await storedRecord()).toBeNull();
  });

  it('RETAINS the record (backoff retry) on a transient IndexedDB failure', async () => {
    // A broken key store must read as transient, never as "key gone" — dropping
    // the record here would strand the registration.
    await saveToLocalStorage({ keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    await flushBrowserRegistration();

    expect(createExtensionInstance).not.toHaveBeenCalled();
    const record = await storedRecord();
    expect(record).toMatchObject({ op: 'create', attempts: 1 });
  });
});

describe('flushBrowserRegistration — 404 re-registration', () => {
  it('re-registers under a fresh extensionID when the record carries the reregister flag', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'dead-id' });
    await seedRecord({ op: 'create', reregister: true });
    createExtensionInstance.mockResolvedValue({ id: 'fresh-id' });

    await flushBrowserRegistration();

    expect(createExtensionInstance).toHaveBeenCalledTimes(1);
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('fresh-id');
    expect(await storedRecord()).toBeNull();
  });

  it('still clears a plain create record when already registered (race)', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'existing-id' });
    await seedRecord({ op: 'create' });

    await flushBrowserRegistration();

    expect(createExtensionInstance).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('existing-id');
    expect(await storedRecord()).toBeNull();
  });

  it('keeps the reregister flag across a failed re-registration attempt', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'dead-id' });
    await seedRecord({ op: 'create', reregister: true });
    createExtensionInstance.mockRejectedValue({ status: 500, statusText: 'Server Error' });

    await flushBrowserRegistration();

    const record = await storedRecord();
    expect(record).toMatchObject({ op: 'create', reregister: true, attempts: 1 });
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('dead-id');
  });

  it('switches an update record to a reregister-create when the server answers 404', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'dead-id', browserInfo: { name: 'ext' } });
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockRejectedValue({ status: 404, statusText: 'Not Found' });

    await flushBrowserRegistration();

    const record = await storedRecord();
    expect(record).toMatchObject({ op: 'create', reregister: true, attempts: 0 });
    // The dead ID is only replaced once the re-registration succeeds.
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('dead-id');
  });
});

describe('flushBrowserRegistration — deferred pairing page after an OFFLINE self-heal', () => {
  const healedOffline = async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, [RECOVERED_PAGE_PENDING_KEY]: true });
    await seedRecord({ op: 'create' });
    createExtensionInstance.mockResolvedValue({ id: 'new-id' });
  };

  it('opens the recovered pairing page, in the background, once the create commits', async () => {
    await healedOffline();

    await flushBrowserRegistration();

    // No user gesture behind an alarm / 'online' / startup flush — never raise the window.
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: false });
    expect(notificationShow).toHaveBeenCalledTimes(1);
    // One-shot: the marker is consumed, so later flushes do not reopen the page.
    expect((await loadFromLocalStorage(RECOVERED_PAGE_PENDING_KEY))[RECOVERED_PAGE_PENDING_KEY]).toBeUndefined();
  });

  it('consumes the marker even when the page cannot be opened, and logs 70 with the flush stage', async () => {
    await healedOffline();
    openInstallPage.mockRejectedValueOnce(new Error('no windows'));
    const storeLog = (await import('@partials/storeLog.js')).default;

    await flushBrowserRegistration();

    expect(storeLog).toHaveBeenCalledWith('warning', 70, expect.any(Error), 'flushBrowserRegistration - openInstallPage');
    expect((await loadFromLocalStorage(RECOVERED_PAGE_PENDING_KEY))[RECOVERED_PAGE_PENDING_KEY]).toBeUndefined();
    // The registration itself still landed.
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('new-id');
  });

  it('opens nothing for an ordinary create (no heal behind it)', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' } });
    await seedRecord({ op: 'create' });
    createExtensionInstance.mockResolvedValue({ id: 'new-id' });

    await flushBrowserRegistration();

    expect(openInstallPage).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
  });
});

describe('flushBrowserRegistration — proxy 407 on update', () => {
  it('RETAINS the record with backoff and logs nothing', async () => {
    const storeLog = (await import('@partials/storeLog.js')).default;
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: { name: 'ext', browser_name: 'Chrome', browser_version: '1' },
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });
    await seedRecord({ op: 'update' });
    updateBrowserExtension.mockRejectedValueOnce({ status: 407, statusText: '', content: '' });

    await flushBrowserRegistration();

    expect(updateBrowserExtension).toHaveBeenCalledTimes(1);
    const record = await storedRecord();
    expect(record).toMatchObject({ op: 'update', attempts: 1, reported: false });
    expect(storeLog).not.toHaveBeenCalled();
    // Nothing committed until the PUT actually lands.
    expect((await loadFromLocalStorage(['extensionVersion'])).extensionVersion).toBeUndefined();
  });
});
