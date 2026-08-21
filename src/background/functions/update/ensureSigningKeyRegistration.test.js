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

import storeLog from '@partials/storeLog.js';
import ensureSigningKeyRegistration from './ensureSigningKeyRegistration.js';
import { REGISTRATION_STORAGE_KEY } from './registrationRetryPolicy.js';
import { getSigningKey } from '@background/functions/signing/signingKeyStore.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';

const BROWSER_INFO = { name: 'ext #1234', browser_name: 'Chrome', browser_version: '139' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureSigningKeyRegistration', () => {
  it('generates key material and enqueues a durable update for a migrated ≤1.8.4 install', async () => {
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: BROWSER_INFO,
      keys: { publicKey: 'rsa-pub' },
      signing: { active: false, conflict: false, registrationRequired: false }
    });

    await ensureSigningKeyRegistration();

    // Key persisted durably BEFORE anything was sent.
    expect(await getSigningKey()).toBeTruthy();
    const stored = await loadFromLocalStorage(['keys']);
    expect(stored.keys.signingPublicKey).toBeTruthy();
    expect(stored.keys.publicKey).toBe('rsa-pub');

    expect(enqueueBrowserRegistration).toHaveBeenCalledWith({ op: 'update', payload: BROWSER_INFO });
  });

  it('is idempotent — a second run reuses the pair and re-enqueues the same payload', async () => {
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: BROWSER_INFO,
      keys: { publicKey: 'rsa-pub' },
      signing: { active: false, conflict: false }
    });

    await ensureSigningKeyRegistration();
    const first = (await loadFromLocalStorage(['keys'])).keys.signingPublicKey;

    await ensureSigningKeyRegistration();
    const second = (await loadFromLocalStorage(['keys'])).keys.signingPublicKey;

    expect(second).toBe(first);
    expect(enqueueBrowserRegistration).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['no extensionID (create path owns the key)', { browserInfo: BROWSER_INFO, signing: { active: false } }],
    ['signing already active', { extensionID: 'e', browserInfo: BROWSER_INFO, signing: { active: true } }],
    ['key conflict', { extensionID: 'e', browserInfo: BROWSER_INFO, signing: { conflict: true } }],
    ['re-registration required', { extensionID: 'e', browserInfo: BROWSER_INFO, signing: { registrationRequired: true } }]
  ])('skips when %s', async (name, storage) => {
    await saveToLocalStorage(storage);

    await ensureSigningKeyRegistration();

    expect(enqueueBrowserRegistration).not.toHaveBeenCalled();
  });

  it('skips while a create record is pending (its success activates signing itself)', async () => {
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: BROWSER_INFO,
      signing: { active: false },
      [REGISTRATION_STORAGE_KEY]: { op: 'create', payload: {}, attempts: 0, firstAttemptAt: 1, nextAttemptAt: 1, reported: false }
    });

    await ensureSigningKeyRegistration();

    expect(enqueueBrowserRegistration).not.toHaveBeenCalled();
  });

  it('logs 63 and resolves (no enqueue) when key material cannot be ensured', async () => {
    await saveToLocalStorage({
      extensionID: 'ext-1',
      browserInfo: BROWSER_INFO,
      keys: { publicKey: 'rsa-pub', signingPublicKey: 'existing-public' },
      signing: { active: false, conflict: false }
    });
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IndexedDB unavailable');
      }
    };

    await expect(ensureSigningKeyRegistration()).resolves.toBeUndefined();

    expect(storeLog).toHaveBeenCalledWith('error', 63, expect.anything(), expect.stringContaining('key material'));
    expect(enqueueBrowserRegistration).not.toHaveBeenCalled();
  });
});
