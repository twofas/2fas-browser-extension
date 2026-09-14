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

  it('merges a caller-supplied cause into the log entry next to the corruptFallbackKey diagnostic', async () => {
    await reportMissingPrivateKey({ keys: { privateKey: 'corrupt' } }, 'checkSafariStorage', { notify: false, cause: { selfHealed: true } });

    expect(storeLog).toHaveBeenCalledTimes(1);
    expect(storeLog.mock.calls[0][2].cause).toEqual({ key: 'rsa', corruptFallbackKey: true, selfHealed: true });
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('reads the corruptFallbackKey diagnostic from the field of the key that is missing', async () => {
    // A signing-key report used to inspect keys.privateKey, so it claimed a corrupt
    // fallback whenever the (healthy) RSA copy happened to be in storage.local, and
    // missed a genuinely corrupt signing copy.
    await reportMissingPrivateKey(
      { keys: { privateKey: 'healthy-rsa-copy' } },
      'verifyStorageIntegrity',
      { notify: false, cause: { key: 'signing' } }
    );
    expect(storeLog.mock.calls[0][2].cause).toEqual({ key: 'signing', corruptFallbackKey: false });

    storeLog.mockClear();

    await reportMissingPrivateKey(
      { keys: { signingPrivateKey: 'corrupt' } },
      'verifyStorageIntegrity',
      { notify: false, cause: { key: 'signing' } }
    );
    // Same incident, already flagged — nothing new is sent.
    expect(storeLog).not.toHaveBeenCalled();

    await clearMissingPrivateKeyReport();
    await reportMissingPrivateKey(
      { keys: { signingPrivateKey: 'corrupt' } },
      'verifyStorageIntegrity',
      { notify: false, cause: { key: 'signing' } }
    );
    expect(storeLog.mock.calls[0][2].cause).toEqual({ key: 'signing', corruptFallbackKey: true });
  });

  it('dedupes per key kind: a logged signing-key loss does not silence a later RSA-key loss', async () => {
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity', { notify: false, cause: { key: 'signing' } });
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity', { notify: false, cause: { key: 'signing' } });
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');

    expect(storeLog).toHaveBeenCalledTimes(2);
    expect(notificationShow).toHaveBeenCalledTimes(1);
    const flags = await loadFromLocalStorage(['privateKeyMissingReported', 'signingKeyMissingReported']);
    expect(flags.privateKeyMissingReported).toBe(true);
    expect(flags.signingKeyMissingReported).toBe(true);

    await clearMissingPrivateKeyReport();
    const after = await loadFromLocalStorage(['privateKeyMissingReported', 'signingKeyMissingReported']);
    expect(after.privateKeyMissingReported).toBeUndefined();
    expect(after.signingKeyMissingReported).toBeUndefined();
  });

  it('clearMissingPrivateKeyReport re-arms reporting for a future incident', async () => {
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');
    await clearMissingPrivateKeyReport();
    await reportMissingPrivateKey({ keys: {} }, 'verifyStorageIntegrity');

    expect(storeLog).toHaveBeenCalledTimes(2);
  });
});
