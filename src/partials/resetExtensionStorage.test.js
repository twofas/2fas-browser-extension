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
import resetExtensionStorage from './resetExtensionStorage.js';

const replace = vi.fn();
const originalWindow = globalThis.window;

beforeEach(() => {
  vi.restoreAllMocks();
  replace.mockClear();
  globalThis.window = { location: { href: 'chrome-extension://id/installPage/installPage.html?reason=recovered', replace } };
});

afterEach(() => {
  // Never leave a fake window (or a live spy) behind for whichever file runs next.
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  vi.restoreAllMocks();
});

describe('resetExtensionStorage', () => {
  it('reloads once the background confirms the reset, dropping the query string', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await resetExtensionStorage();

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: 'storageReset' });
    // Keeping `?reason=recovered` would make a deliberate reset come back announcing
    // that the encryption key was lost.
    expect(replace).toHaveBeenCalledWith('chrome-extension://id/installPage/installPage.html');
  });

  it('throws and does NOT reload when the background refuses (never a reload loop)', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ status: 'error', message: 'Forbidden' });

    await expect(resetExtensionStorage()).rejects.toThrow('Forbidden');
    expect(replace).not.toHaveBeenCalled();
  });

  it('throws when there is no answer at all', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue(undefined);

    await expect(resetExtensionStorage()).rejects.toThrow('no response');
    expect(replace).not.toHaveBeenCalled();
  });
});
