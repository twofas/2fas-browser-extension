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

// The FIRST launch of 1.9.0 over an existing, healthy Safari install must be
// invisible to the user: no regeneration, no notification, no pairing page, no
// key-loss log. Safari fires runtime.onStartup and runtime.onInstalled('update')
// on the same launch, so both run here concurrently against real modules — only
// the network, the notification sink and the tab opener are stand-ins.

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({
  default: { show: (...a) => notificationShow(...a), showWithoutTimeout: (...a) => notificationShow(...a) }
}));

const openInstallPage = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/openInstallPage.js', () => ({ default: (...a) => openInstallPage(...a) }));

vi.mock('@background/contextMenu/index.js', () => ({ initContextMenu: vi.fn().mockResolvedValue(undefined) }));

const createExtensionInstance = vi.fn();
const updateBrowserExtension = vi.fn();
const removeAllPairedDevices = vi.fn();
vi.mock('@sdk/index.js', () => ({
  default: class SDK {
    createExtensionInstance (...a) { return createExtensionInstance(...a); }
    updateBrowserExtension (...a) { return updateBrowserExtension(...a); }
    removeAllPairedDevices (...a) { return removeAllPairedDevices(...a); }
  }
}));

// A wrongful heal would otherwise stall the run for RECHECK_DELAY_MS before failing.
vi.mock('@partials/wait.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import onStartup from './onStartup.js';
import onInstalled from './onInstalled.js';
import { savePrivateKey, getOrMigratePrivateKey } from '@background/functions/privateKeyStore.js';
import { getOrMigrateSigningKey } from '@background/functions/signing/signingKeyStore.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { HEAL_HISTORY_KEY } from '@background/functions/selfHealMissingPrivateKey.js';

const RSA = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: { name: 'SHA-512' } };
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const b64 = buf => Buffer.from(buf).toString('base64');

const BROWSER_INFO = { name: 'Greg’s Safari', browser_name: 'Safari', browser_version: '26.5' };
const DEVICES = [{ device_id: 'dev-1', device_public_key: 'device-pub' }];

// Exactly what 1.8.4's generateDefaultStorage + a successful pairing left behind.
const base184 = () => ({
  configured: true,
  browserInfo: BROWSER_INFO,
  keys: { publicKey: 'rsa-pub-184' },
  extensionID: 'ext-184',
  devices: DEVICES,
  contextMenu: true,
  logging: true,
  incognito: false,
  nativePush: false,
  pinInfo: false,
  extensionVersion: '1.8.4',
  autoSubmitEnabled: true,
  autoSubmitExcludedDomains: ['bank.test'],
  attempt: 1,
  extIcon: 0,
  storageSchemaVersion: 1
});

const launch = () => Promise.all([onStartup(), onInstalled({ reason: 'update', previousVersion: '1.8.4' })]);

const KEY_LOSS_LOG_IDS = [57, 64, 66, 69, 70, 73];

const expectInvisibleUpgrade = async ({ extensionID, publicKey }) => {
  const after = await loadFromLocalStorage(null);

  // Identity untouched.
  expect(after.extensionID).toBe(extensionID);
  expect(after.keys.publicKey).toBe(publicKey);
  expect(after.devices).toEqual(DEVICES);
  expect(after.configured).toBe(true);
  expect(createExtensionInstance).not.toHaveBeenCalled();
  expect(removeAllPairedDevices).not.toHaveBeenCalled();
  expect(after[HEAL_HISTORY_KEY]).toBeUndefined();

  // Nothing shown, nothing opened.
  expect(notificationShow).not.toHaveBeenCalled();
  expect(openInstallPage).not.toHaveBeenCalled();
  expect(storeLog.mock.calls.filter(call => KEY_LOSS_LOG_IDS.includes(call[1]))).toEqual([]);

  // The token key still decrypts.
  expect(await getOrMigratePrivateKey(after)).toBeTruthy();

  return after;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('EXT_PLATFORM', 'Safari');
  createExtensionInstance.mockRejectedValue(new Error('must not register a new identity during an upgrade'));
  updateBrowserExtension.mockResolvedValue({});
  removeAllPairedDevices.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Safari upgrade 1.8.4 → 1.9.0, first launch', () => {
  it('leaves a healthy install with its RSA key in IndexedDB alone and registers a signing key', async () => {
    // 1.8.3/1.8.4 promoted the key into IndexedDB (non-extractable) and stripped the
    // plaintext once the promotion proved durable — the common Safari state.
    const pair = await crypto.subtle.generateKey(RSA, false, ['encrypt', 'decrypt']);
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage(base184());

    await launch();

    const after = await expectInvisibleUpgrade({ extensionID: 'ext-184', publicKey: 'rsa-pub-184' });

    // v1.9.0 migration landed: schema bumped, signing seeded, key registered by PUT.
    expect(after.storageSchemaVersion).toBe(3);
    expect(updateBrowserExtension).toHaveBeenCalledWith('ext-184', expect.objectContaining({ public_signing_key: expect.any(String) }), expect.anything());
    expect(after.signing).toEqual(expect.objectContaining({ active: true, conflict: false, registrationRequired: false }));
    // Safari policy: the new signing key lives in storage.local, and it resolves.
    expect(typeof after.keys.signingPrivateKey).toBe('string');
    expect(await getOrMigrateSigningKey(after)).toBeTruthy();
    // The RSA key was NOT moved anywhere: still only in IndexedDB.
    expect(after.keys.privateKey).toBeUndefined();
  });

  it('leaves a 1.8.4 install whose plaintext RSA key was never stripped alone (used in place, not promoted)', async () => {
    // Strip never proved durable: pkcs8 still in storage.local, a promoted copy in
    // IndexedDB, and the 1.8.4 durability stamp next to it.
    const pair = await crypto.subtle.generateKey(RSA, true, ['encrypt', 'decrypt']);
    const pkcs8 = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    await savePrivateKey(pair.privateKey);
    await saveToLocalStorage({
      ...base184(),
      keys: { publicKey: 'rsa-pub-184', privateKey: pkcs8 },
      privateKeyIdbStamp: { fingerprint: 'abc', sessionID: 'old-session' }
    });

    await launch();

    const after = await expectInvisibleUpgrade({ extensionID: 'ext-184', publicKey: 'rsa-pub-184' });

    // Never promoted, never stripped; the v3 migration only drops the stamp.
    expect(after.keys.privateKey).toBe(pkcs8);
    expect(after.privateKeyIdbStamp).toBeUndefined();
    expect(after.storageSchemaVersion).toBe(3);
  });

  it('leaves an earlier 1.9.0 install (both keys pkcs8 in storage.local, signing active) alone — no second key registration', async () => {
    const rsa = await crypto.subtle.generateKey(RSA, true, ['encrypt', 'decrypt']);
    const ecdsa = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    await saveToLocalStorage({
      ...base184(),
      extensionVersion: '1.9.0',
      storageSchemaVersion: 3,
      keys: {
        publicKey: 'rsa-pub-190',
        privateKey: b64(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)),
        signingPublicKey: 'spub-190',
        signingPrivateKey: b64(await crypto.subtle.exportKey('pkcs8', ecdsa.privateKey))
      },
      extensionID: 'ext-190',
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    await launch();

    const after = await expectInvisibleUpgrade({ extensionID: 'ext-190', publicKey: 'rsa-pub-190' });

    // An already-registered key is never re-sent: that is the PUT the backend
    // answers with the "already has public signing key" conflict.
    for (const call of updateBrowserExtension.mock.calls) {
      expect(call[1]).not.toHaveProperty('public_signing_key');
    }
    expect(after.keys.signingPublicKey).toBe('spub-190');
  });

  it('heals ONLY the install whose IndexedDB was already orphaned (issue #142) — its pairing was dead before the upgrade', async () => {
    // storage.local intact, IndexedDB empty: every token already failed to decrypt on
    // 1.8.4. This is the population the self-heal exists for, and the one group that
    // legitimately sees "pair again" on the first 1.9.0 launch.
    await saveToLocalStorage(base184());
    createExtensionInstance.mockResolvedValue({ id: 'ext-healed' });

    await launch();

    const after = await loadFromLocalStorage(null);
    expect(after.extensionID).toBe('ext-healed');
    expect(after.keys.publicKey).not.toBe('rsa-pub-184');
    expect(removeAllPairedDevices).toHaveBeenCalledWith('ext-184');
    expect(openInstallPage).toHaveBeenCalledWith('recovered', { focusWindow: false });
    expect(storeLog).toHaveBeenCalledWith('warning', 69, expect.anything(), expect.any(String));
    // Exactly one regeneration despite onStartup and onInstalled racing.
    expect(createExtensionInstance).toHaveBeenCalledTimes(1);
    // Preferences survived; the healed install is registered and keeps signing active.
    expect(after.logging).toBe(true);
    expect(after.autoSubmitExcludedDomains).toEqual(['bank.test']);
    expect(after.signing).toEqual(expect.objectContaining({ active: true }));
  });

  it('never wipes when only the SIGNING key fails to load — tokens still decrypt', async () => {
    // The one Safari-specific piece the storage.local flip could not exercise
    // before: importing an ECDSA pkcs8 blob. If WebKit ever rejects it, the RSA key
    // is still fine and the pairing still works — this must stay a silent log.
    const rsa = await crypto.subtle.generateKey(RSA, true, ['encrypt', 'decrypt']);
    await saveToLocalStorage({
      ...base184(),
      extensionVersion: '1.9.0',
      storageSchemaVersion: 3,
      keys: {
        publicKey: 'rsa-pub-190',
        privateKey: b64(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)),
        signingPublicKey: 'spub-190',
        signingPrivateKey: 'bm90LWEta2V5' // "not-a-key": import throws, no IndexedDB copy either
      },
      extensionID: 'ext-190',
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    await launch();

    const after = await loadFromLocalStorage(null);

    expect(after.extensionID).toBe('ext-190');
    expect(after.devices).toEqual(DEVICES);
    expect(createExtensionInstance).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
    expect(openInstallPage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalledWith('warning', 69, expect.anything(), expect.anything());
    // Reported once, as a signing-key loss — not as an RSA loss, not as a heal.
    const calls57 = storeLog.mock.calls.filter(call => call[1] === 57);
    expect(calls57.length).toBeGreaterThanOrEqual(1);
    expect(calls57.every(call => call[2]?.cause?.key === 'signing' && !call[2]?.cause?.selfHealed)).toBe(true);
  });
});
