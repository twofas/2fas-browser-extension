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

import storeLog from '@partials/storeLog.js';
import getSigningHeaders from './getSigningHeaders.js';
import { generateSigningKeyMaterial } from './signingKeyStore.js';
import { HEADER_SIGNATURE, HEADER_SIGNATURE_NONCE } from './signingHeaderNames.js';
import { saveToLocalStorage } from '@localStorage/index.js';

const URL_UNDER_TEST = 'https://api.example.test/browser_extensions/abc/commands/request_2fa_token';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSigningHeaders', () => {
  it('returns {} while signing is not active (migration window, unregistered key)', async () => {
    await saveToLocalStorage({ signing: { active: false, conflict: false } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('returns {} in the conflict state even with a usable key — signing with the wrong key would 401', async () => {
    await generateSigningKeyMaterial();
    await saveToLocalStorage({ signing: { active: true, conflict: true } });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
  });

  it('signs when active with a usable key, fresh nonce per call', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: true, conflict: false }
    });

    const a = await getSigningHeaders('POST', URL_UNDER_TEST, '{"domain":"x"}');
    const b = await getSigningHeaders('POST', URL_UNDER_TEST, '{"domain":"x"}');

    expect(a[HEADER_SIGNATURE]).toBeTruthy();
    expect(a[HEADER_SIGNATURE_NONCE]).not.toBe(b[HEADER_SIGNATURE_NONCE]);
  });

  it('degrades to {} and logs 65 when the key is unusable while active', async () => {
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: 'registered-but-lost' },
      signing: { active: true, conflict: false }
    });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}')).toEqual({});
    expect(storeLog).toHaveBeenCalledWith('error', 65, expect.anything(), 'getSigningHeaders');
  });

  it('skipLog suppresses the storeLog call (storeLog path must never recurse)', async () => {
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: 'registered-but-lost' },
      signing: { active: true, conflict: false }
    });

    expect(await getSigningHeaders('POST', URL_UNDER_TEST, '{}', { skipLog: true })).toEqual({});
    expect(storeLog).not.toHaveBeenCalled();
  });
});
