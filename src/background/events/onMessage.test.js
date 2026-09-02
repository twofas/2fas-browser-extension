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

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const handleUpdateList = vi.fn();
vi.mock('@background/functions/updateListAction.js', () => ({ default: (...args) => handleUpdateList(...args) }));

const generateDefaultStorage = vi.fn();
vi.mock('@background/functions/generateDefaultStorage.js', () => ({ default: (...args) => generateDefaultStorage(...args) }));
vi.mock('@background/functions/getBrowserInfo.js', () => ({ default: vi.fn().mockResolvedValue({ name: 'Chrome' }) }));

import browser from 'webextension-polyfill';
import onMessage from './onMessage.js';
import storeLog from '@partials/storeLog.js';
import { clearLocalStorage, saveToLocalStorage } from '@localStorage/index.js';
import { REGISTRATION_STORAGE_KEY } from '@background/functions/update/registrationRetryPolicy.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// The default polyfill stub reports this as the extension base URL.
const OPTIONS_PAGE_SENDER = { url: 'chrome-extension://test-extension-id/optionsPage/optionsPage.html' };

beforeEach(async () => {
  handleUpdateList.mockReset();
  storeLog.mockClear();
  await clearLocalStorage();
  // The handler confirms the reset actually produced key material before it answers
  // `ok`, so the stand-in has to behave like the real generateDefaultStorage.
  generateDefaultStorage.mockReset();
  generateDefaultStorage.mockImplementation(async () => {
    await saveToLocalStorage({ keys: { publicKey: 'pub-new', signingPublicKey: 'spub-new' }, extensionID: 'ext-new' });
  });
});

describe('onMessage — updateList', () => {
  it('applies the mutation and responds with ok plus the new list', async () => {
    handleUpdateList.mockResolvedValue({ list: 'domains', result: ['x.com'], added: true });
    const sendResponse = vi.fn();

    const ret = onMessage({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' }, OPTIONS_PAGE_SENDER, sendResponse);
    expect(ret).toBe(true);

    await flush();

    expect(handleUpdateList).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' })
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', list: 'domains', result: ['x.com'], added: true })
    );
  });

  it('responds with error and logs (id 53) when the mutation fails', async () => {
    handleUpdateList.mockRejectedValue(new Error('boom'));
    const sendResponse = vi.fn();

    onMessage({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' }, OPTIONS_PAGE_SENDER, sendResponse);

    await flush();

    expect(storeLog).toHaveBeenCalledWith('error', 53, expect.any(Error), 'updateList');
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error' });
  });

  it('refuses a content script — updateList mutates persisted user state', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'updateList', list: 'domains', op: 'add', value: 'x.com' }, { url: 'https://evil.test/login', tab: { id: 3 } }, sendResponse);

    await flush();

    expect(handleUpdateList).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Forbidden' });
  });

  it('rejects a malformed updateList request without calling the mutator', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'updateList' }, OPTIONS_PAGE_SENDER, sendResponse);

    await flush();

    expect(handleUpdateList).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});

describe('onMessage — storageReset sender guard', () => {
  const EXT_BASE = 'chrome-extension://abcdefgh/';
  const sendResponseNoop = () => {};
  let getURLSpy = null;

  // Restore explicitly: a leaked getURL spy makes every other describe's
  // extension-page sender look foreign, which only shows up under a shuffled run.
  afterEach(() => {
    getURLSpy?.mockRestore();
    getURLSpy = null;
  });

  beforeEach(() => {
    generateDefaultStorage.mockClear();
    getURLSpy = vi.spyOn(browser.runtime, 'getURL').mockImplementation(path => `${EXT_BASE}${path || ''}`);
  });

  it('regenerates storage for the extension\'s own pages (options / install page)', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { url: `${EXT_BASE}optionsPage/optionsPage.html` }, sendResponse);
    await flush();

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'ok', pending: false });
  });

  it('refuses a content script (web-page url) — a page-level context must never mint a new identity', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { url: 'https://evil.test/login', tab: { id: 3 } }, sendResponse);
    await flush();

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Forbidden' });
  });

  it('refuses a sender without a url and without an extension-page tab', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, {}, sendResponse);
    await flush();

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('accepts a url-less sender whose tab is an extension page (older Safari bridge) and logs warning 71', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { id: browser.runtime.id, tab: { id: 1, url: `${EXT_BASE}installPage/installPage.html` } }, sendResponse);
    await flush();

    expect(generateDefaultStorage).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ status: 'ok', pending: false });
    expect(storeLog).toHaveBeenCalledWith('warning', 71, expect.any(Error), 'storageReset');
  });

  it('answers `pending` — not `ok` — while the durable create still owns the keys', async () => {
    // Offline install/reset: the keys are written and the POST is queued. Wiping now
    // would drop the record, mint another keypair and bump `attempt` toward the
    // "data error" overlay, so the page has to wait instead of reloading.
    await saveToLocalStorage({
      keys: { publicKey: 'pub' },
      [REGISTRATION_STORAGE_KEY]: { op: 'create', attempts: 1 }
    });
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { url: `${EXT_BASE}optionsPage/optionsPage.html` }, sendResponse);
    await flush();

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'pending' });
  });

  it('answers `error` when the regeneration silently produced no key material', async () => {
    // generateDefaultStorage resolves even when it fails (it logs 28 and moves on),
    // and it clears storage.local first — so answering `ok` here sent the page into a
    // reload loop against empty storage that no attempt counter could break.
    generateDefaultStorage.mockImplementation(async () => { await clearLocalStorage(); });
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { url: `${EXT_BASE}optionsPage/optionsPage.html` }, sendResponse);
    await flush();

    expect(storeLog).toHaveBeenCalledWith('error', 37, expect.any(Error), 'storageReset');
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error' });
  });

  it('flags an `ok` answer as pending when the regeneration could not register yet', async () => {
    // A deliberate reset that regenerated the keys but could not reach the API is a
    // success (the durable retry owns the rest) — but the page must not reload into a
    // pairing screen that has no extensionID.
    generateDefaultStorage.mockImplementation(async () => {
      await clearLocalStorage();
      await saveToLocalStorage({
        keys: { publicKey: 'pub-new' },
        [REGISTRATION_STORAGE_KEY]: { op: 'create', attempts: 1 }
      });
    });
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { url: `${EXT_BASE}optionsPage/optionsPage.html` }, sendResponse);
    await flush();

    expect(sendResponse).toHaveBeenCalledWith({ status: 'ok', pending: true });
  });

  it('reports the tab-url fallback (71) only once per install', async () => {
    const senderWithoutUrl = { id: browser.runtime.id, tab: { id: 1, url: `${EXT_BASE}installPage/installPage.html` } };

    onMessage({ action: 'storageReset' }, senderWithoutUrl, sendResponseNoop);
    await flush();
    onMessage({ action: 'storageReset' }, senderWithoutUrl, sendResponseNoop);
    await flush();

    const calls71 = storeLog.mock.calls.filter(call => call[1] === 71);
    expect(calls71).toHaveLength(1);
  });

  it('refuses a url-less sender whose tab is a web page (content script on an old bridge)', async () => {
    const sendResponse = vi.fn();

    onMessage({ action: 'storageReset' }, { id: browser.runtime.id, tab: { id: 1, url: 'https://evil.test/' } }, sendResponse);
    await flush();

    expect(generateDefaultStorage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ status: 'error', message: 'Forbidden' });
  });
});
