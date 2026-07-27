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

import { describe, it, expect, vi, afterEach } from 'vitest';
import browser from 'webextension-polyfill';
import { loadFromSessionStorage } from '@sessionStorage/index.js';
// setKeepAliveAlarmOwner is deliberately NOT called here — this file's module
// instance stays a non-owner (the install-page context), so it must never touch
// the extension-global alarm / deadline key that the background owns.
import { startKeepAlive, stopKeepAlive, KEEP_ALIVE_ALARM_NAME } from './keepAlive.js';

const DEADLINE_KEY = 'keepAliveUntil';

const getDeadline = async () => {
  const data = await loadFromSessionStorage(DEADLINE_KEY);
  return data?.[DEADLINE_KEY] ?? null;
};

describe('keepAlive — non-owner (install-page) context', () => {
  afterEach(async () => {
    await stopKeepAlive();
    vi.useRealTimers();
  });

  it('never creates the backstop alarm or writes the shared deadline key', async () => {
    const createSpy = vi.spyOn(browser.alarms, 'create');

    await startKeepAlive(60_000);

    expect(createSpy).not.toHaveBeenCalled();
    expect(await browser.alarms.get(KEEP_ALIVE_ALARM_NAME)).toBeNull();
    expect(await getDeadline()).toBeNull();

    createSpy.mockRestore();
  });

  it('never clears the shared alarm or deadline on teardown (leaves the owner\'s backstop intact)', async () => {
    // The background owns this alarm / deadline; simulate them being present.
    await browser.alarms.create(KEEP_ALIVE_ALARM_NAME, { periodInMinutes: 0.5 });
    await browser.storage.session.set({ [DEADLINE_KEY]: Date.now() + 60_000 });

    const clearSpy = vi.spyOn(browser.alarms, 'clear');

    await startKeepAlive(60_000);
    await stopKeepAlive();

    expect(clearSpy).not.toHaveBeenCalled();
    // The owner's backstop survives the non-owner's full lifecycle.
    expect(await browser.alarms.get(KEEP_ALIVE_ALARM_NAME)).not.toBeNull();
    expect(await getDeadline()).not.toBeNull();

    clearSpy.mockRestore();
  });

  it('still runs the in-memory heartbeat while active', async () => {
    vi.useFakeTimers();
    const getSpy = vi.spyOn(browser.storage.local, 'get');

    await startKeepAlive(120_000);
    getSpy.mockClear();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(getSpy).toHaveBeenCalledTimes(1);

    await stopKeepAlive();
    getSpy.mockClear();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSpy).not.toHaveBeenCalled();

    getSpy.mockRestore();
  });
});
