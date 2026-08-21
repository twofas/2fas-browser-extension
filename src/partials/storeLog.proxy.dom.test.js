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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sdkStoreLog = vi.fn().mockResolvedValue({});
vi.mock('../sdk/index.js', () => ({
  default: class SDK {
    storeLog (...args) { return sdkStoreLog(...args); }
  }
}));

import browser from 'webextension-polyfill';
import storeLog from './storeLog.js';
import isContentScriptContext from './isContentScriptContext.js';
import { saveToLocalStorage } from '../localStorage/index.js';

// jsdom pages run on http://localhost — with getURL returning an extension
// base URL, that reads as a CONTENT-SCRIPT context (page origin ≠ extension origin).
const EXTENSION_BASE_URL = 'chrome-extension://test-extension-id/';

const originalGetURL = browser.runtime.getURL;
const originalSendMessage = browser.runtime.sendMessage;

beforeEach(async () => {
  vi.clearAllMocks();
  browser.runtime.getURL = () => EXTENSION_BASE_URL;
  await saveToLocalStorage({ logging: true, extensionID: 'ext-1', browserInfo: { name: 'ext' } });
});

afterEach(() => {
  browser.runtime.getURL = originalGetURL;
  browser.runtime.sendMessage = originalSendMessage;
});

describe('isContentScriptContext', () => {
  it('is true on a web page (jsdom localhost vs extension base URL)', () => {
    expect(isContentScriptContext()).toBe(true);
  });

  it('is false when the page IS an extension page', () => {
    browser.runtime.getURL = () => window.location.href.slice(0, 10);
    // Simulate by comparing against a base the current URL starts with.
    browser.runtime.getURL = () => `${window.location.protocol}//${window.location.host}/`;
    expect(isContentScriptContext()).toBe(false);
  });
});

describe('storeLog proxying from a content script', () => {
  it('routes the log through runtime.sendMessage (storeLogEvent) instead of a direct SDK call', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ status: 'ok' });
    browser.runtime.sendMessage = sendMessage;

    await storeLog('error', 14, new Error('boom'), 'https://example.com/login');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0][0];
    expect(message.action).toBe('storeLogEvent');
    expect(message.level).toBe('error');
    expect(typeof message.message).toBe('string');
    expect(message.context.logID).toBe(14);
    expect(sdkStoreLog).not.toHaveBeenCalled();
  });

  it('falls back to the direct SDK call when messaging fails', async () => {
    browser.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('no receiver'));

    await storeLog('warning', 46, new Error('boom'), 'https://example.com/login');

    expect(sdkStoreLog).toHaveBeenCalledTimes(1);
    expect(sdkStoreLog.mock.calls[0][0]).toBe('ext-1');
  });

  it('falls back to the direct SDK call on a non-ok proxy response', async () => {
    browser.runtime.sendMessage = vi.fn().mockResolvedValue({ status: 'error' });

    await storeLog('info', 33, new Error('boom'), 'https://example.com/login');

    expect(sdkStoreLog).toHaveBeenCalledTimes(1);
  });

  it('still short-circuits before any send when logging is disabled', async () => {
    await saveToLocalStorage({ logging: false });
    const sendMessage = vi.fn();
    browser.runtime.sendMessage = sendMessage;

    await storeLog('error', 14, new Error('boom'), 'https://example.com/login');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(sdkStoreLog).not.toHaveBeenCalled();
  });
});
