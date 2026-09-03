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

import storeLog from './storeLog.js';
import { saveToLocalStorage } from '../localStorage/index.js';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'dir').mockImplementation(() => {});
  await saveToLocalStorage({ logging: true, extensionID: 'ext-1', browserInfo: { name: 'ext' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storeLog — proxy 407 never reaches the backend (#1163)', () => {
  it('drops the legacy SDK shape ({ status: 407 })', async () => {
    await storeLog('error', 5, { status: 407, statusText: '', content: '', message: 'legacy-407' }, 'test');

    expect(sdkStoreLog).not.toHaveBeenCalled();
  });

  it('drops the durable-registration shape ({ backendStatus: 407 }) — logs 27/28', async () => {
    // registrationErrorInfo renames status → backendStatus; the 2023 filter
    // only knew the SDK field name, so these leaked since 1.8.3.
    await storeLog('error', 27, {
      message: 'Browser-extension update registration failed',
      name: 'RegistrationError',
      op: 'update',
      attempts: 0,
      pendingForMs: 333,
      online: true,
      backendStatus: 407,
      backendStatusText: '',
      backendContent: '',
      stack: null,
      cause: null
    }, 'flushBrowserRegistration - update - non-retryable');

    expect(sdkStoreLog).not.toHaveBeenCalled();
  });

  it('drops a 407 identified only by its reason phrase in the registration shape', async () => {
    await storeLog('error', 27, {
      message: 'reason-phrase-407',
      backendStatus: null,
      backendStatusText: 'Proxy Authentication Required'
    }, 'test');

    expect(sdkStoreLog).not.toHaveBeenCalled();
  });

  it('still sends a genuinely stuck registration (control: backendStatus 500)', async () => {
    await storeLog('error', 27, {
      message: 'stuck-500',
      op: 'update',
      backendStatus: 500,
      backendStatusText: 'Internal Server Error'
    }, 'flushBrowserRegistration - update - stuck');

    expect(sdkStoreLog).toHaveBeenCalledTimes(1);
  });
});
