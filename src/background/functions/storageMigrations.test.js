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

import { describe, it, expect, vi } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import runStorageMigrations, { CURRENT_SCHEMA_VERSION } from './storageMigrations.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import browser from 'webextension-polyfill';

describe('runStorageMigrations', () => {
  it('backfills an unversioned (existing) install to the current schema version', async () => {
    await saveToLocalStorage({ autoSubmitExcludedDomains: ['keep.com'] });

    const applied = await runStorageMigrations();

    expect(applied).toBe(CURRENT_SCHEMA_VERSION);

    const stored = await loadFromLocalStorage(['storageSchemaVersion', 'autoSubmitExcludedDomains']);
    expect(stored.storageSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(stored.autoSubmitExcludedDomains).toEqual(['keep.com']);
  });

  it('normalizes a non-array autoSubmitExcludedDomains to an array (v0→v1)', async () => {
    await saveToLocalStorage({ autoSubmitExcludedDomains: undefined });
    // Simulate a corrupt/legacy non-array value.
    await browser.storage.local.set({ autoSubmitExcludedDomains: 'not-an-array' });

    await runStorageMigrations();

    const stored = await loadFromLocalStorage(['autoSubmitExcludedDomains']);
    expect(stored.autoSubmitExcludedDomains).toEqual([]);
  });

  it('is a no-op when storage is already at the current version', async () => {
    await saveToLocalStorage({ storageSchemaVersion: CURRENT_SCHEMA_VERSION });
    const setSpy = vi.spyOn(browser.storage.local, 'set');

    const applied = await runStorageMigrations();

    expect(applied).toBe(CURRENT_SCHEMA_VERSION);
    expect(setSpy).not.toHaveBeenCalled();

    setSpy.mockRestore();
  });

  it('is idempotent across repeated runs', async () => {
    await saveToLocalStorage({ autoSubmitExcludedDomains: ['a.com'] });

    await runStorageMigrations();
    const setSpy = vi.spyOn(browser.storage.local, 'set');
    await runStorageMigrations();

    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it('seeds the signing lifecycle state (v1→v2) without touching an existing one', async () => {
    await saveToLocalStorage({ storageSchemaVersion: 1, autoSubmitExcludedDomains: [] });

    await runStorageMigrations();

    const stored = await loadFromLocalStorage(['signing', 'storageSchemaVersion']);
    expect(stored.signing).toEqual({ active: false, conflict: false, registrationRequired: false, auth401Count: 0 });
    expect(stored.storageSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('keeps an already-present signing state intact when re-running from v1', async () => {
    await saveToLocalStorage({
      storageSchemaVersion: 1,
      autoSubmitExcludedDomains: [],
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 }
    });

    await runStorageMigrations();

    const stored = await loadFromLocalStorage(['signing']);
    expect(stored.signing).toMatchObject({ active: true });
  });

  it('drops the retired key-promotion stamps (v2→v3) and leaves everything else alone', async () => {
    await saveToLocalStorage({
      storageSchemaVersion: 2,
      autoSubmitExcludedDomains: [],
      signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 },
      keys: { publicKey: 'pub', privateKey: 'legacy-plaintext' },
      privateKeyIdbStamp: { fingerprint: 'f', sessionID: 's' },
      signingKeyIdbStamp: { fingerprint: 'g', sessionID: 's' }
    });

    await runStorageMigrations();

    const stored = await loadFromLocalStorage(null);
    expect(stored.privateKeyIdbStamp).toBeUndefined();
    expect(stored.signingKeyIdbStamp).toBeUndefined();
    // A leftover plaintext key is NOT stripped — storage.local keys are used in place.
    expect(stored.keys.privateKey).toBe('legacy-plaintext');
    expect(stored.signing.active).toBe(true);
    expect(stored.storageSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('does not downgrade a storage whose version is newer than this build', async () => {
    await saveToLocalStorage({ storageSchemaVersion: CURRENT_SCHEMA_VERSION + 5 });

    const applied = await runStorageMigrations();

    const stored = await loadFromLocalStorage(['storageSchemaVersion']);
    expect(stored.storageSchemaVersion).toBe(CURRENT_SCHEMA_VERSION + 5);
    expect(applied).toBe(CURRENT_SCHEMA_VERSION + 5);
  });
});
