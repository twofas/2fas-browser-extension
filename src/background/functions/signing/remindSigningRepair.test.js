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
import browser from 'webextension-polyfill';
import config from '@/config.js';
import remindSigningRepair, { remindSigningRepairInTab, REMINDED_VERSION_KEY } from './remindSigningRepair.js';
import { loadFromLocalStorage, saveToLocalStorage } from '@localStorage/index.js';

const SIGNING = { active: false, conflict: false, registrationRequired: false, auth401Count: 0, challenged: false };

let create;

beforeEach(async () => {
  await saveToLocalStorage({ nativePush: true });
  create = vi.spyOn(browser.notifications, 'create').mockResolvedValue('id');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('remindSigningRepair', () => {
  it('reminds a conflicted install once per extension version, with the conflict text', async () => {
    await saveToLocalStorage({ signing: { ...SIGNING, conflict: true } });

    await remindSigningRepair();
    await remindSigningRepair();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1].title).toBe(config.Texts.Error.SigningKeyConflict.Title);
    expect(create.mock.calls[0][1].message).toBe(config.Texts.Error.SigningKeyConflict.Message);
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });

  it('an install the backend rejects for good gets the renewal text', async () => {
    await saveToLocalStorage({ signing: { ...SIGNING, active: true, registrationRequired: true } });

    await remindSigningRepair();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1].title).toBe(config.Texts.Error.SigningRequired.Title);
  });

  it.each([
    ['active', { ...SIGNING, active: true }],
    ['inactive but not broken', SIGNING],
    ['challenged', { ...SIGNING, challenged: true }]
  ])('never reminds an install that is %s', async (_, signing) => {
    await saveToLocalStorage({ signing });

    await remindSigningRepair();

    expect(create).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBeUndefined();
  });

  it('a new extension version reminds again', async () => {
    await saveToLocalStorage({ signing: { ...SIGNING, conflict: true }, [REMINDED_VERSION_KEY]: '0.0.1' });

    await remindSigningRepair();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a native notification that fails is tried again on the next start — nothing was shown, so nothing nags', async () => {
    await saveToLocalStorage({ signing: { ...SIGNING, conflict: true } });
    create.mockRejectedValueOnce(new Error('notifications unavailable'));

    await expect(remindSigningRepair()).resolves.toBeUndefined();
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBeUndefined();

    await remindSigningRepair();

    expect(create).toHaveBeenCalledTimes(2);
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });
});

describe('remindSigningRepair — front-end push (nativePush off, Safari default)', () => {
  let query;
  let sendMessage;

  beforeEach(async () => {
    await saveToLocalStorage({ nativePush: false, signing: { ...SIGNING, conflict: true } });
    query = vi.spyOn(browser.tabs, 'query').mockResolvedValue([{ id: 7 }]);
    sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({});
  });

  it('renders in the active tab of the focused window and marks the version only after the page took it', async () => {
    await remindSigningRepair();

    expect(create).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe(7);
    expect(sendMessage.mock.calls[0][1]).toMatchObject({ action: 'notification', title: config.Texts.Error.SigningKeyConflict.Title });
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });

  it('with no page to render in, shows nothing and marks nothing — the next start tries again', async () => {
    query.mockResolvedValue([]);

    await remindSigningRepair();

    expect(sendMessage).not.toHaveBeenCalled();
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBeUndefined();
  });

  it('a page without the content script (message refused) marks nothing either', async () => {
    sendMessage.mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));

    await expect(remindSigningRepair()).resolves.toBeUndefined();
    await remindSigningRepair();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });
});

describe('remindSigningRepair — single flight', () => {
  it('a start that also applies an update reminds once, not once per trigger', async () => {
    await saveToLocalStorage({ signing: { ...SIGNING, conflict: true } });

    await Promise.all([remindSigningRepair(), remindSigningRepair()]);

    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('remindSigningRepair — a conflicted install whose registration was then rejected', () => {
  it('hears the conflict wording on every surface: the cause, not the consequence', async () => {
    await saveToLocalStorage({ signing: { ...SIGNING, conflict: true, registrationRequired: true } });

    await remindSigningRepair();

    expect(create.mock.calls[0][1].title).toBe(config.Texts.Error.SigningKeyConflict.Title);
  });
});

describe('remindSigningRepairInTab — delivery when a page with the content script has just loaded', () => {
  let query;
  let sendMessage;

  beforeEach(async () => {
    await saveToLocalStorage({ nativePush: false, signing: { ...SIGNING, conflict: true } });
    query = vi.spyOn(browser.tabs, 'query').mockResolvedValue([]);
    sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({});
  });

  it('renders in that tab without querying for one, and marks the version', async () => {
    await remindSigningRepairInTab(7);

    expect(query).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe(7);
    expect(sendMessage.mock.calls[0][1]).toMatchObject({ action: 'notification', title: config.Texts.Error.SigningKeyConflict.Title });
    expect((await loadFromLocalStorage(REMINDED_VERSION_KEY))[REMINDED_VERSION_KEY]).toBe(config.ExtensionVersion);
  });

  it('is a no-op once this version was reminded, and for a healthy install', async () => {
    await remindSigningRepairInTab(7);
    await remindSigningRepairInTab(8);

    expect(sendMessage).toHaveBeenCalledTimes(1);

    await saveToLocalStorage({ signing: SIGNING, [REMINDED_VERSION_KEY]: '0.0.1' });
    await remindSigningRepairInTab(9);

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('two pages loading at once produce one notice', async () => {
    await Promise.all([remindSigningRepairInTab(7), remindSigningRepairInTab(8)]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('with native push the notice goes to the OS, still once', async () => {
    await saveToLocalStorage({ nativePush: true });

    await remindSigningRepairInTab(7);
    await remindSigningRepair();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('never delays or rejects: an invalid tab id resolves', async () => {
    await expect(remindSigningRepairInTab(undefined)).resolves.toBeUndefined();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
