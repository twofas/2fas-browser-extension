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

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/generateDefaultStorage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/openInstallPage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
const enqueueBrowserRegistration = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/update/enqueueBrowserRegistration.js', () => ({ default: (...a) => enqueueBrowserRegistration(...a) }));
vi.mock('@background/functions/update/flushBrowserRegistration.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/getBrowserInfo.js', () => ({ default: vi.fn().mockResolvedValue({ name: 'Safari', browser_name: 'Safari', browser_version: '26' }) }));
const wait = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/wait.js', () => ({ default: (...a) => wait(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

import checkSafariStorage from './checkSafariStorage.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import storeLog from '@partials/storeLog.js';
import { savePrivateKey, getPrivateKey } from '@background/functions/privateKeyStore.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';
import Crypt from '@background/functions/Crypt.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks wipes call history but KEEPS implementations, so a test that made
  // generateDefaultStorage actually write an identity would silently change what
  // every later test sees. Restore the inert default explicitly.
  generateDefaultStorage.mockReset();
  generateDefaultStorage.mockResolvedValue(undefined);
  // checkSafariStorage only ever runs in the Safari build (onInstalled gate).
  vi.stubEnv('EXT_PLATFORM', 'Safari');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('checkSafariStorage', () => {
  it('does nothing when storage is complete and the private key is in IndexedDB', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' }, extensionID: 'id' });

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
  });

  it('accepts a storage.local (legacy / fallback) key in place without regenerating storage', async () => {
    const crypt = new Crypt();
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, true, ['encrypt', 'decrypt']);
    const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
    const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey, privateKey }, extensionID: 'id' });

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    // Used in place: not promoted into IndexedDB, not stripped.
    expect(await getPrivateKey()).toBeUndefined();
    const after = await loadFromLocalStorage(['keys']);
    expect(after.keys.privateKey).toBeDefined();
  });

  it('reports a lost SIGNING key but never regenerates — tokens still decrypt with the RSA key', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({
      browserInfo: { name: 'Safari' },
      keys: { publicKey: 'pub', signingPublicKey: 'spub' },
      extensionID: 'id',
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    await checkSafariStorage({ name: 'Safari' });

    // Even on Safari: the RSA key resolved, so this pairing still works and a wipe
    // would unpair a functioning install to fix request signing. The 401 ->
    // registrationRequired path owns that recovery. Logged only, no notification.
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.objectContaining({ cause: expect.objectContaining({ key: 'signing' }) }), 'checkSafariStorage');
    expect(storeLog).not.toHaveBeenCalledWith('warning', 69, expect.anything(), expect.anything());
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('regenerates storage and opens the install page when storage is missing and the registration succeeded', async () => {
    generateDefaultStorage.mockImplementationOnce(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });
    });

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledTimes(1);
  });

  it('regenerates but does NOT open the install page when the registration is still pending (offline)', async () => {
    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).not.toHaveBeenCalled();
  });

  it('leaves a pending durable create alone on later starts (keys present, no extensionID, create record queued)', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, pendingBrowserRegistration: { op: 'create' } });
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    // enqueueBrowserRegistration is idempotent: the existing record keeps its backoff.
    expect(enqueueBrowserRegistration).toHaveBeenCalledTimes(1);
  });

  it('hands existing keys to the durable create instead of minting new ones every launch', async () => {
    // A deterministic 4xx leaves no pending record, and this check now runs on every
    // Safari start: the old "no record ⇒ regenerate" rule burned a fresh keypair, a
    // POST and an `attempt` per launch, forever. The keys on disk are registrable.
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' } });
    // The private half must still be resolvable — sendCreate refuses to register a
    // public key it cannot pair with one, and would drop the record.
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(enqueueBrowserRegistration).toHaveBeenCalledWith({ op: 'create', payload: { name: 'Safari' } });
    expect(openInstallPage).not.toHaveBeenCalled();
    // Same keys, untouched.
    expect((await loadFromLocalStorage(['keys'])).keys.publicKey).toBe('pub');
  });

  it('regenerates when the keys are unregistrable — the private half is gone and nothing was ever paired', async () => {
    // No extensionID means nothing was registered, so a fresh keypair orphans nothing.
    // Enqueueing here would be a permanent no-op: sendCreate drops a record whose
    // private key cannot be resolved, so the install would never recover.
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' } });
    generateDefaultStorage.mockImplementation(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub-new' }, extensionID: 'id-new' });
    });

    await checkSafariStorage({ name: 'Safari' });

    expect(enqueueBrowserRegistration).not.toHaveBeenCalled();
    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledTimes(1);
  });

  it('still regenerates when storage holds no key material at all (fresh / wiped install)', async () => {
    generateDefaultStorage.mockImplementation(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });
    });

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledTimes(1);
  });

  it('collapses overlapping runs (onInstalled + onStartup) into a single regeneration', async () => {
    generateDefaultStorage.mockImplementation(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });
    });

    await Promise.all([
      checkSafariStorage({ name: 'Safari' }),
      checkSafariStorage({ name: 'Safari' })
    ]);

    generateDefaultStorage.mockResolvedValue(undefined);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).toHaveBeenCalledTimes(1);
  });

  it('self-heals when registered but the private key is gone: reports, regenerates, opens the install page (issue #142)', async () => {
    // Registered install (base storage intact — it outlives an app reinstall on
    // Safari), IndexedDB key lost. The "reinstall" advice cannot clear this state
    // and the paired devices are already unusable, so regenerate + re-pair.
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' }, extensionID: 'id', logging: true });
    // A heal is only a heal once NEW key material is actually in storage — the real
    // generateDefaultStorage resolves even when it fails, so the stand-in has to
    // regenerate for this to count.
    generateDefaultStorage.mockImplementation(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub-new', signingPublicKey: 'spub-new' }, extensionID: 'id-new' });
    });

    await checkSafariStorage({ name: 'Safari' });

    // Logged (57 with the self-heal marker + 69) BEFORE the regeneration wipes
    // storage.local, otherwise the entries could never reach the backend.
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.objectContaining({ cause: expect.objectContaining({ selfHealed: true }) }), 'checkSafariStorage');
    expect(storeLog).toHaveBeenCalledWith('warning', 69, expect.any(Error), 'checkSafariStorage');
    expect(storeLog.mock.invocationCallOrder[0]).toBeLessThan(generateDefaultStorage.mock.invocationCallOrder[0]);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    // The background-page notification is invisible on Safari — the install page
    // carries the explanation instead, opened with the "recovered" reason.
    expect(notificationShow).not.toHaveBeenCalled();
    // Background trigger: the page opens, but must not yank the window forward.
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: false });
  });

  it('falls back to the report-only path when the regeneration silently changed nothing', async () => {
    // generateDefaultStorage never rejects, so "resolved" is not "regenerated".
    // Claiming a heal here would tell the user the extension was reset while the
    // dead identity is still in storage.
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' }, extensionID: 'id', logging: true });
    generateDefaultStorage.mockImplementation(async () => {});

    await checkSafariStorage({ name: 'Safari' });

    expect(storeLog).toHaveBeenCalledWith('error', 70, expect.any(Error), 'checkSafariStorage');
    expect(openInstallPage).not.toHaveBeenCalled();
    // Report-only fallback: the re-pair prompt the user would otherwise never see,
    // and the dead identity untouched.
    expect(notificationShow).toHaveBeenCalledTimes(1);
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('id');
  });

  it('treats a key that shows up on the delayed re-read as a false alarm: no regeneration, no report', async () => {
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' }, extensionID: 'id', privateKeyMissingReported: true });
    // The key lands in IndexedDB during the heal's pause (WebKit finishing its
    // origin rename) — modelled by the stubbed wait.
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    wait.mockImplementationOnce(async () => {
      await savePrivateKey(pair.privateKey);
    });

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    // Stale flag from an earlier report is cleared — the install is valid.
    expect((await loadFromLocalStorage(['privateKeyMissingReported'])).privateKeyMissingReported).toBeUndefined();
  });

  it('opens the install page with the recovered reason once the regeneration is registered', async () => {
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' }, extensionID: 'id' });
    generateDefaultStorage.mockImplementationOnce(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub-new' }, extensionID: 'id-new' });
    });

    await checkSafariStorage({ name: 'Safari' });

    expect(openInstallPage).toHaveBeenCalledTimes(1);
    // Background trigger: the page opens, but must not yank the window forward.
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: false });
  });

  it('falls back to the report-only policy when self-heal is not available for the platform', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Chrome');
    await saveToLocalStorage({ browserInfo: { name: 'Safari' }, keys: { publicKey: 'pub' }, extensionID: 'id' });

    await checkSafariStorage({ name: 'Safari' });
    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.any(Error), 'checkSafariStorage');
    expect(notificationShow).toHaveBeenCalledTimes(1);
    const after = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(after.keys.publicKey).toBe('pub');
    expect(after.extensionID).toBe('id');
  });
});

describe('checkSafariStorage — identity predicate', () => {
  it('never regenerates a registered install just because browserInfo is missing (runs on every start)', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id', devices: [{ id: 'dev-1' }] });

    await checkSafariStorage({ name: 'Safari' });

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    const after = await loadFromLocalStorage(['keys', 'extensionID', 'devices']);
    expect(after.extensionID).toBe('id');
    expect(after.devices).toEqual([{ id: 'dev-1' }]);
  });
});
