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

// The modal is DOM-bound; here it simply runs the confirm callback.
const showConfirmModal = vi.fn((header, text, func) => func());
vi.mock('@optionsPage/functions/showConfirmModal.js', () => ({ default: (...a) => showConfirmModal(...a) }));

const resetExtensionStorage = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/resetExtensionStorage.js', () => ({ default: (...a) => resetExtensionStorage(...a) }));

const clearLocalStorage = vi.fn().mockResolvedValue(undefined);
vi.mock('@localStorage/clearLocalStorage.js', () => ({ default: (...a) => clearLocalStorage(...a) }));

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

import browser from 'webextension-polyfill';
import config from '@/config.js';
import handleSafariReset from './handleSafariReset.js';
import storeLog from '@partials/storeLog.js';
import { saveToLocalStorage, loadFromLocalStorage } from '@localStorage/index.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({ status: 'ok' });
  await saveToLocalStorage({ extensionID: 'id', keys: { publicKey: 'pub' } });
});

describe('handleSafariReset (Danger Zone reset, every platform)', () => {
  it('goes through the shared non-destructive reset after confirmation — nothing wiped page-side', async () => {
    handleSafariReset();
    await flush();

    expect(showConfirmModal).toHaveBeenCalledTimes(1);
    expect(resetExtensionStorage).toHaveBeenCalledTimes(1);
    expect(clearLocalStorage).not.toHaveBeenCalled();
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    // The background owns the wipe; the page's copy is still intact here.
    expect((await loadFromLocalStorage(['extensionID'])).extensionID).toBe('id');
  });

  it('logs 36 and shows an error when the background refuses or fails the reset', async () => {
    resetExtensionStorage.mockRejectedValueOnce(new Error('storageReset failed: Forbidden'));

    handleSafariReset();
    await flush();

    expect(storeLog).toHaveBeenCalledWith('error', 36, expect.any(Error), 'handleSafariReset');
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.UndefinedError, null, true);
  });
});
