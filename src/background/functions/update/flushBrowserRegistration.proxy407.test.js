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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Deliberately NOT mocking @partials/storeLog.js: the 1.8.3 regression lived in
// the seam between registrationErrorInfo (field names) and storeLog's 407 filter.
// Only the SDK is stubbed, exposing both the PUT and the log transport.
const updateBrowserExtension = vi.fn();
const sdkStoreLog = vi.fn().mockResolvedValue({});
vi.mock('@sdk/index.js', () => ({
  default: class SDK {
    updateBrowserExtension (...args) { return updateBrowserExtension(...args); }
    storeLog (...args) { return sdkStoreLog(...args); }
  }
}));

import flushBrowserRegistration from './flushBrowserRegistration.js';
import { REGISTRATION_STORAGE_KEY, MAX_ATTEMPTS_BEFORE_ESCALATE } from './registrationRetryPolicy.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';

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

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'dir').mockImplementation(() => {});
  // Signing not yet active → sendUpdate attaches public_signing_key (1.9.0
  // migration path), generating the pair on the fly in the fake IndexedDB.
  await saveToLocalStorage({
    logging: true,
    extensionID: 'ext-1',
    browserInfo: { name: 'ext', browser_name: 'Chrome', browser_version: '1' },
    keys: { publicKey: 'pub' }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('flushBrowserRegistration — proxy 407 end-to-end (real storeLog)', () => {
  it('escalating attempt on a 407: nothing reaches the backend log and the once-per-episode slot stays free', async () => {
    await seedRecord({ op: 'update', attempts: MAX_ATTEMPTS_BEFORE_ESCALATE - 1 });
    updateBrowserExtension.mockRejectedValueOnce({ status: 407, statusText: '', content: '' });

    await flushBrowserRegistration();

    expect(updateBrowserExtension).toHaveBeenCalledTimes(1);
    expect(typeof updateBrowserExtension.mock.calls[0][1].public_signing_key).toBe('string');
    expect(sdkStoreLog).not.toHaveBeenCalled();
    expect(await storedRecord()).toMatchObject({ op: 'update', attempts: MAX_ATTEMPTS_BEFORE_ESCALATE, reported: false });
    expect((await loadFromLocalStorage(['signing'])).signing?.active).toBeFalsy();
  });

  it('control: the same attempt on a 500 reports log 27 once, with backendStatus, and marks the episode', async () => {
    await seedRecord({ op: 'update', attempts: MAX_ATTEMPTS_BEFORE_ESCALATE - 1 });
    updateBrowserExtension.mockRejectedValueOnce({ status: 500, statusText: 'Internal Server Error', content: '' });

    await flushBrowserRegistration();

    expect(sdkStoreLog).toHaveBeenCalledTimes(1);
    const [extID, level, , context] = sdkStoreLog.mock.calls[0];
    expect(extID).toBe('ext-1');
    expect(level).toBe('error');
    expect(context.logID).toBe(27);
    expect(context.errorInfo).toMatchObject({ op: 'update', backendStatus: 500, attempts: MAX_ATTEMPTS_BEFORE_ESCALATE });
    expect(await storedRecord()).toMatchObject({ attempts: MAX_ATTEMPTS_BEFORE_ESCALATE, reported: true });
  });
});
