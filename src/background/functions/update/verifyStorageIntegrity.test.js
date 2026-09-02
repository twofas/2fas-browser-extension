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

/* global crypto, DOMException */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/generateDefaultStorage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/openInstallPage.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/update/flushBrowserRegistration.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@background/functions/getBrowserInfo.js', () => ({ default: vi.fn().mockResolvedValue({ name: 'Safari', browser_name: 'Safari', browser_version: '26' }) }));
vi.mock('@partials/wait.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

import verifyStorageIntegrity from './verifyStorageIntegrity.js';
import generateDefaultStorage from '@background/functions/generateDefaultStorage.js';
import openInstallPage from '@background/functions/openInstallPage.js';
import storeLog from '@partials/storeLog.js';
import { savePrivateKey, getPrivateKey } from '@background/functions/privateKeyStore.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';
import Crypt from '@background/functions/Crypt.js';

const GEN_PARAMS = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verifyStorageIntegrity', () => {
  it('is valid without regenerating when public key + extension ID exist and the private key is in IndexedDB', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(true);
    expect(generateDefaultStorage).not.toHaveBeenCalled();
  });

  it('accepts a storage.local (legacy / fallback) key in place and stays valid without regenerating', async () => {
    const crypt = new Crypt();
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, true, ['encrypt', 'decrypt']);
    const publicKey = crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey));
    const privateKey = crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey));
    await saveToLocalStorage({ keys: { publicKey, privateKey }, extensionID: 'id' });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(true);
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    // Used in place: not promoted into IndexedDB, not stripped.
    expect(await getPrivateKey()).toBeUndefined();
    const after = await loadFromLocalStorage(['keys']);
    expect(after.keys.privateKey).toBeDefined();
  });

  it('flags a lost signing key while signing is active — log 57 (cause.key signing), NO notification, no regeneration', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({
      keys: { publicKey: 'pub', signingPublicKey: 'spub' },
      extensionID: 'id',
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.objectContaining({ cause: expect.objectContaining({ key: 'signing' }) }), 'verifyStorageIntegrity');
    // Tokens still decrypt — the 401 path owns the user-facing side later.
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('does not require a signing key before signing is active (minted on demand by ensureSigningKeyRegistration)', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id', signing: { active: false } });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(true);
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('regenerates default storage when storage is corrupt', async () => {
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
  });

  it('does NOT regenerate (orphaning devices) when registered but the private key is gone; prompts re-pair (Z3)', async () => {
    // Public key + extensionID present (a fully registered install), but no private
    // key in IndexedDB and no legacy key → the key was evicted, not a fresh install.
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);

    // Crucially: no silent regeneration (which would orphan every paired device).
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    // A re-pair prompt is shown and the state is logged under its own ID, with a
    // diagnostic cause telling an empty IndexedDB apart from a corrupt fallback key.
    expect(notificationShow).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.any(Error), 'verifyStorageIntegrity');
    expect(storeLog.mock.calls[0][2].cause).toEqual({ key: 'rsa', corruptFallbackKey: false });

    // Storage is left untouched — recovery is an explicit reset/re-pair.
    const after = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(after.keys.publicKey).toBe('pub');
    expect(after.extensionID).toBe('id');
  });

  it('reports the missing private key only ONCE across repeated update events', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });

    // Three onInstalled(update/browser_update) events in a row.
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);

    // One log + one notification total — the flood collapses to one report per incident.
    expect(storeLog).toHaveBeenCalledTimes(1);
    expect(notificationShow).toHaveBeenCalledTimes(1);
    const after = await loadFromLocalStorage(['privateKeyMissingReported']);
    expect(after.privateKeyMissingReported).toBe(true);
  });

  it('persists the reported flag even when the notification fails, so the dedup still holds', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });
    notificationShow.mockRejectedValueOnce(new Error('no notification surface'));

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);

    expect(storeLog).toHaveBeenCalledTimes(1);
    expect((await loadFromLocalStorage(['privateKeyMissingReported'])).privateKeyMissingReported).toBe(true);
  });

  it('clears the reported flag once the private key is usable again, so a new incident reports anew', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(storeLog).toHaveBeenCalledTimes(1);

    // The key comes back (e.g. the user re-imported / storage recovered).
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(true);
    expect((await loadFromLocalStorage(['privateKeyMissingReported'])).privateKeyMissingReported).toBeUndefined();

    // A second, separate loss is reported again.
    const { deletePrivateKey } = await import('@background/functions/privateKeyStore.js');
    await deletePrivateKey();
    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);
    expect(storeLog).toHaveBeenCalledTimes(2);
  });

  it('becomes valid via the storage.local fallback key when IndexedDB is unavailable (fresh install)', async () => {
    // Firefox permanent private browsing: indexedDB.open throws for extension pages.
    globalThis.indexedDB = {
      open: () => {
        throw new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError');
      }
    };

    // Simulate generateDefaultStorage's fallback outcome: registration completed,
    // private key persisted as pkcs8 base64 in storage.local instead of IndexedDB.
    generateDefaultStorage.mockImplementationOnce(async () => {
      const crypt = new Crypt();
      const pair = await crypto.subtle.generateKey(GEN_PARAMS, true, ['encrypt', 'decrypt']);
      await saveToLocalStorage({
        keys: {
          publicKey: crypt.ArrayBufferToString(await crypt.exportKey('spki', pair.publicKey)),
          privateKey: crypt.ArrayBufferToString(await crypt.exportKey('pkcs8', pair.privateKey))
        },
        extensionID: 'id'
      });
    });

    expect(await verifyStorageIntegrity({ name: 'Firefox' })).toBe(true);
    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    // The fallback key must survive in storage.local — it is the only copy.
    const after = await loadFromLocalStorage(['keys']);
    expect(after.keys.privateKey).toBeDefined();
  });
});

describe('verifyStorageIntegrity — Safari self-heal (issue #142)', () => {
  beforeEach(() => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');
  });

  const registeredKeyless = () => saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id', logging: true });

  const regenerateValid = async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub-new' }, extensionID: 'id-new' });
  };

  it('regenerates instead of only reporting, and is valid afterwards', async () => {
    await registeredKeyless();
    generateDefaultStorage.mockImplementationOnce(regenerateValid);

    expect(await verifyStorageIntegrity({ name: 'Safari' })).toBe(true);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    // Background trigger: the page opens, but must not yank the window forward.
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: false });
    // 57 (self-heal marker) + 69, both before the wipe; the deduped re-pair
    // notification is NOT shown (invisible on Safari anyway — the install page explains).
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.objectContaining({ cause: expect.objectContaining({ selfHealed: true }) }), 'verifyStorageIntegrity');
    expect(storeLog).toHaveBeenCalledWith('warning', 69, expect.any(Error), 'verifyStorageIntegrity');
    expect(storeLog.mock.invocationCallOrder[0]).toBeLessThan(generateDefaultStorage.mock.invocationCallOrder[0]);
    expect(notificationShow).not.toHaveBeenCalled();

    const after = await loadFromLocalStorage(['keys', 'extensionID', 'privateKeyMissingReported']);
    expect(after.extensionID).toBe('id-new');
    expect(after.privateKeyMissingReported).toBeUndefined();
  });

  it('reports a lost SIGNING key but never regenerates — the RSA key still decrypts tokens', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({
      keys: { publicKey: 'pub', signingPublicKey: 'spub' },
      extensionID: 'id',
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    expect(await verifyStorageIntegrity({ name: 'Safari' })).toBe(false);

    // NOT healed, on any platform. classifyKeyMaterial reports 'missingSigningKey'
    // only after the RSA key resolved, so tokens still decrypt and the pairing is
    // alive — the one case where the heal's premise ("regenerating orphans nothing
    // that still works") is false. Wiping here would unpair a working install to fix
    // request signing, which the 401 -> registrationRequired path owns instead.
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalledWith('warning', 69, expect.anything(), expect.anything());
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.objectContaining({ cause: expect.objectContaining({ key: 'signing' }) }), 'verifyStorageIntegrity');
  });

  it('returns false (no install page) when the regeneration could not register yet', async () => {
    await registeredKeyless();
    // Offline: generateDefaultStorage cleared storage, keys written, create enqueued, no extensionID.
    generateDefaultStorage.mockImplementationOnce(async () => {
      await saveToLocalStorage({ keys: { publicKey: 'pub-new' } });
    });

    expect(await verifyStorageIntegrity({ name: 'Safari' })).toBe(false);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(openInstallPage).not.toHaveBeenCalled();
  });

  it('falls back to the report-only path when the heal itself fails (log 70), leaving storage untouched', async () => {
    await registeredKeyless();
    generateDefaultStorage.mockRejectedValueOnce(new Error('boom'));

    expect(await verifyStorageIntegrity({ name: 'Safari' })).toBe(false);

    expect(storeLog).toHaveBeenCalledWith('error', 70, expect.any(Error), 'verifyStorageIntegrity');
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.any(Error), 'verifyStorageIntegrity');
    expect(openInstallPage).not.toHaveBeenCalled();
    const after = await loadFromLocalStorage(['keys', 'extensionID']);
    expect(after.extensionID).toBe('id');
  });

  it('does not regenerate a healthy Safari install', async () => {
    const pair = await crypto.subtle.generateKey(GEN_PARAMS, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, extensionID: 'id' });

    expect(await verifyStorageIntegrity({ name: 'Safari' })).toBe(true);
    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
  });
});

describe('verifyStorageIntegrity — pending durable registration', () => {
  it('leaves a pending create alone (keys written, POST still retrying) instead of minting new keys', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, pendingBrowserRegistration: { op: 'create', attempts: 2 } });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    const after = await loadFromLocalStorage(['keys', 'pendingBrowserRegistration']);
    expect(after.keys.publicKey).toBe('pub');
    expect(after.pendingBrowserRegistration.op).toBe('create');
  });

  it('still regenerates an incomplete storage that has no pending create', async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub' }, pendingBrowserRegistration: { op: 'update' } });

    expect(await verifyStorageIntegrity({ name: 'Chrome' })).toBe(false);

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
  });
});
