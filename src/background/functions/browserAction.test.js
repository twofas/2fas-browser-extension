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
// Partial: browserAction also imports the pure isSupportedTabURL predicate from this
// module, and a factory that returns only `default` makes that import undefined.
vi.mock('@background/functions/browserActionConfigured.js', async importOriginal => ({
  ...(await importOriginal()),
  default: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@background/functions/syncDevicesWithAPI.js', () => ({ default: vi.fn().mockResolvedValue({ storage: {}, hasDevices: true }) }));

const openInstallPage = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/openInstallPage.js', () => ({ default: (...a) => openInstallPage(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

const getOrMigratePrivateKey = vi.fn();
vi.mock('@background/functions/privateKeyStore.js', async importOriginal => ({
  ...(await importOriginal()),
  getOrMigratePrivateKey: (...a) => getOrMigratePrivateKey(...a)
}));

const selfHealMissingPrivateKey = vi.fn();
vi.mock('@background/functions/selfHealMissingPrivateKey.js', async importOriginal => ({
  ...(await importOriginal()),
  default: (...a) => selfHealMissingPrivateKey(...a)
}));

const reportMissingPrivateKey = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/reportMissingPrivateKey.js', () => ({
  default: (...a) => reportMissingPrivateKey(...a),
  clearMissingPrivateKeyReport: vi.fn().mockResolvedValue(undefined)
}));

import browser from 'webextension-polyfill';
import config from '@/config.js';
import browserAction from './browserAction.js';
import { saveToLocalStorage } from '@localStorage/index.js';
import browserActionConfigured from '@background/functions/browserActionConfigured.js';
import storeLog from '@partials/storeLog.js';

const EXT_BASE = 'safari-web-extension://0F3B1C2D-1111-2222-3333-444455556666';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(browser.runtime, 'getURL').mockImplementation(path => `${EXT_BASE}${path}`);
  getOrMigratePrivateKey.mockReset();
  getOrMigratePrivateKey.mockResolvedValue('rsa-private-key');
  selfHealMissingPrivateKey.mockReset();
  selfHealMissingPrivateKey.mockResolvedValue(false);
  await saveToLocalStorage({ configured: false });
});

describe('browserAction — unconfigured extension', () => {
  it('opens the install page from an ordinary tab', async () => {
    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(openInstallPage).toHaveBeenCalledTimes(1);
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('shows "configure first" instead of a second install tab when already on the install page', async () => {
    await browserAction({ id: 7, url: `${EXT_BASE}/installPage/installPage.html` });

    expect(openInstallPage).not.toHaveBeenCalled();
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.ConfigFirst, 7);
  });

  it('recognises the install page opened by the self-heal (?reason=recovered) — no second install tab', async () => {
    await browserAction({ id: 7, url: `${EXT_BASE}/installPage/installPage.html?reason=recovered` });

    expect(openInstallPage).not.toHaveBeenCalled();
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.ConfigFirst, 7);
  });

  it('does not mistake another page under the extension origin for the install page', async () => {
    await browserAction({ id: 7, url: `${EXT_BASE}/optionsPage/optionsPage.html` });

    expect(openInstallPage).toHaveBeenCalledTimes(1);
  });
});

describe('browserAction — pre-flight key check', () => {
  beforeEach(async () => {
    await saveToLocalStorage({ configured: true, keys: { publicKey: 'pub' }, extensionID: 'ext-1' });
  });

  it('never sends a request the extension could not finish: regenerates and points at the pairing page', async () => {
    // Without this the user watches the request succeed, approves the push on the
    // phone, and only then learns the token cannot be decrypted.
    getOrMigratePrivateKey.mockResolvedValue(null);
    selfHealMissingPrivateKey.mockResolvedValue('regenerated');

    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(browserActionConfigured).not.toHaveBeenCalled();
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.StorageRecovered, 7);
  });

  it('heals on every platform here — the user is waiting, unlike the background integrity check', async () => {
    getOrMigratePrivateKey.mockResolvedValue(null);
    selfHealMissingPrivateKey.mockResolvedValue('regenerated');

    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(selfHealMissingPrivateKey).toHaveBeenCalledWith(expect.anything(), 'browserAction', { userInitiated: true });
  });

  it('falls back to the deduped report WITH a tabID when the heal cannot run', async () => {
    // A notification raised from the worker without a tabID goes through the DOM path
    // and is invisible whenever the user turned native notifications off.
    getOrMigratePrivateKey.mockResolvedValue(null);
    selfHealMissingPrivateKey.mockResolvedValue(false);

    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(reportMissingPrivateKey).toHaveBeenCalledWith(expect.anything(), 'browserAction', { notify: false });
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.StorageIntegrity, 7);
    expect(browserActionConfigured).not.toHaveBeenCalled();
  });

  it('continues with the request when the delayed re-read found the key after all', async () => {
    getOrMigratePrivateKey.mockResolvedValue(null);
    selfHealMissingPrivateKey.mockResolvedValue('keyPresent');

    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
    expect(browserActionConfigured).toHaveBeenCalledTimes(1);
  });

  it('never heals from a tab that could not carry a request anyway', async () => {
    // chrome://, about: and PDF viewers never reach initBEAction, and they have no
    // content script — so a wipe there would be both pointless and unexplained.
    getOrMigratePrivateKey.mockResolvedValue(null);

    await browserAction({ id: 7, url: 'chrome://extensions' });

    expect(selfHealMissingPrivateKey).not.toHaveBeenCalled();
    expect(reportMissingPrivateKey).not.toHaveBeenCalled();
  });

  it('lets a healthy install through untouched', async () => {
    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(selfHealMissingPrivateKey).not.toHaveBeenCalled();
    expect(browserActionConfigured).toHaveBeenCalledTimes(1);
  });

  it('propagates a transient IndexedDB failure as error 4 instead of treating it as key loss', async () => {
    // The key stores throw rather than resolve null precisely so this cannot be
    // mistaken for a missing key and trigger a wipe.
    getOrMigratePrivateKey.mockRejectedValue(new Error('IndexedDB unavailable'));

    await browserAction({ id: 7, url: 'https://example.test/login' });

    expect(selfHealMissingPrivateKey).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('error', 4, expect.any(Error), 'https://example.test/login');
  });
});
