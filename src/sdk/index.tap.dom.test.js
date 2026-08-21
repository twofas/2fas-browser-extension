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

/* global Response */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import browser from 'webextension-polyfill';
import SDK from './index.js';
import { getSigningState } from '@background/functions/signing/signingState.js';
import { saveToLocalStorage } from '@localStorage/index.js';

const EXTENSION_BASE_URL = 'chrome-extension://test-extension-id/';
const originalGetURL = browser.runtime.getURL;

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  browser.runtime.getURL = originalGetURL;
});

describe('SDK response tap — content-script isolation', () => {
  it('401s from the content-script storeLog fallback never mutate the shared signing state', async () => {
    // Regression for the review finding: post-migration-window, a content
    // script's direct (unsigned) storeLog fallback receives 401s; counting
    // them would flip registrationRequired on a healthy install.
    browser.runtime.getURL = () => EXTENSION_BASE_URL; // jsdom page → CS context
    await saveToLocalStorage({ signing: { active: true, conflict: false, registrationRequired: false, auth401Count: 0 } });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('', { status: 401 })));

    const sdk = new SDK();
    await sdk.storeLog('ext-1', 'error', 'm', { logID: 1 });
    await sdk.storeLog('ext-1', 'error', 'm', { logID: 2 });
    await sdk.storeLog('ext-1', 'error', 'm', { logID: 3 });
    await new Promise(resolve => setTimeout(resolve, 50));

    const state = await getSigningState();
    expect(state.auth401Count).toBe(0);
    expect(state.registrationRequired).toBe(false);
  });

  it('the tap still counts 401s in an extension-page context', async () => {
    browser.runtime.getURL = () => `${window.location.protocol}//${window.location.host}/`;
    await saveToLocalStorage({ signing: { active: false, conflict: false, registrationRequired: false, auth401Count: 0 } });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('', { status: 401 })));

    await new SDK().removePairedDevice('ext-1', 'd1').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 50));

    expect((await getSigningState()).auth401Count).toBe(1);
  });
});
