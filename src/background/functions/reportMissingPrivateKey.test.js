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
import config from '@/config.js';

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

import reportMissingPrivateKey, { clearMissingPrivateKeyReport } from './reportMissingPrivateKey.js';
import { loadFromLocalStorage } from '@localStorage/index.js';

beforeEach(() => {
  storeLog.mockClear();
  notificationShow.mockClear();
});

describe('reportMissingPrivateKey', () => {
  it('logs error 57 with the notification once, then dedupes on later calls', async () => {
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');

    expect(storeLog).toHaveBeenCalledTimes(1);
    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.any(Error), 'verifyStorageIntegrity');
    expect(notificationShow).toHaveBeenCalledTimes(1);
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.StorageIntegrity);

    const flagged = await loadFromLocalStorage('privateKeyMissingReported');
    expect(flagged.privateKeyMissingReported).toBe(true);
  });

  it('notify: false logs error 57 and sets the flag WITHOUT showing the notification', async () => {
    await reportMissingPrivateKey({ keys: {} }, 'handleLoginRequest', { notify: false });

    expect(storeLog).toHaveBeenCalledWith('error', 57, expect.any(Error), 'handleLoginRequest');
    expect(notificationShow).not.toHaveBeenCalled();

    const flagged = await loadFromLocalStorage('privateKeyMissingReported');
    expect(flagged.privateKeyMissingReported).toBe(true);
  });

  it('clearMissingPrivateKeyReport re-arms reporting for a future incident', async () => {
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');
    await clearMissingPrivateKeyReport();
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');

    expect(storeLog).toHaveBeenCalledTimes(2);
  });
});
