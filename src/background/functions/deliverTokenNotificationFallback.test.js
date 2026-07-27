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
import browser from 'webextension-polyfill';

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const topFrameStillHostsRequest = vi.fn();
vi.mock('@background/functions/topFrameStillHostsRequest.js', () => ({ default: (...a) => topFrameStillHostsRequest(...a) }));

import deliverTokenNotificationFallback from './deliverTokenNotificationFallback.js';

const TAB = 8;
const REQ = 'req-1';
const TOKEN = 'TOKEN42';

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
  topFrameStillHostsRequest.mockReset();
});

describe('deliverTokenNotificationFallback', () => {
  it('shows the copy-to-clipboard token notification in the top frame when the top frame is safe', async () => {
    topFrameStillHostsRequest.mockResolvedValue(true);
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(sendMessage).toHaveBeenCalledWith(
      TAB,
      { action: 'showTokenNotification', token: TOKEN, token_request_id: REQ },
      { frameId: 0 }
    );
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('Z1: withholds the token (no message) and logs 56 when the top frame is not safe', async () => {
    topFrameStillHostsRequest.mockResolvedValue(false);
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('warning', 56, expect.any(Error), 'handleLoginRequest');
  });

  it('F1: never surfaces the token via a native notification — logs 58 and drops it when the front-end notification is rejected', async () => {
    topFrameStillHostsRequest.mockResolvedValue(true);
    vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(new Error('no content script'));

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(storeLog).toHaveBeenCalledWith(
      'warning',
      58,
      expect.objectContaining({ message: expect.stringContaining('withheld') }),
      'handleLoginRequest'
    );
  });

  it('logs 58 when the content script responds with a non-ok status', async () => {
    topFrameStillHostsRequest.mockResolvedValue(true);
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'omitted' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(storeLog).toHaveBeenCalledWith('warning', 58, expect.any(Error), 'handleLoginRequest');
  });
});
