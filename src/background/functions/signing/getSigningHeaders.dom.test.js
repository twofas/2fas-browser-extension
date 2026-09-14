// @vitest-environment jsdom
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

import browser from 'webextension-polyfill';
import getSigningHeaders from './getSigningHeaders.js';
import { saveToLocalStorage } from '@localStorage/index.js';

const EXTENSION_BASE_URL = 'chrome-extension://test-extension-id/';
const originalGetURL = browser.runtime.getURL;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  browser.runtime.getURL = originalGetURL;
});

describe('getSigningHeaders — content-script context guard', () => {
  it('never signs (and never touches the key store) from a content-script context', async () => {
    // jsdom page (http://localhost) + extension base URL → content script.
    browser.runtime.getURL = () => EXTENSION_BASE_URL;

    // Even with signing active AND a page-storage pkcs8 fallback present, the
    // guard must return {} before any key material is read — importing or
    // promoting the key here would put it into the PAGE's indexedDB.
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');

    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: 'spk', signingPrivateKey: pkcs8 },
      signing: { active: true, conflict: false }
    });

    const idbOpen = vi.spyOn(globalThis.indexedDB, 'open');

    expect(await getSigningHeaders('POST', 'https://api.example.test/x', '{}')).toEqual({});
    expect(idbOpen).not.toHaveBeenCalled();
  });

  it('signs normally from an extension page (options/install)', async () => {
    browser.runtime.getURL = () => `${window.location.protocol}//${window.location.host}/`;

    const { generateSigningKeyMaterial } = await import('./signingKeyStore.js');
    const material = await generateSigningKeyMaterial();

    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: true, conflict: false }
    });

    const headers = await getSigningHeaders('POST', 'https://api.example.test/x', '{}');

    expect(headers['X-2FAS-Signature']).toBeTruthy();
  });
});
