//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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
import config from '@/config.js';

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const topFrameStillHostsRequest = vi.fn();
vi.mock('@background/functions/topFrameStillHostsRequest.js', () => ({ default: (...a) => topFrameStillHostsRequest(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

const showNativePush = vi.fn().mockResolvedValue('notification-id');
vi.mock('@notification/functions/showNativePush.js', () => ({ default: (...a) => showNativePush(...a) }));

import deliverTokenNotificationFallback from './deliverTokenNotificationFallback.js';

const TAB = 8;
const REQ = 'req-1';
const TOKEN = 'TOKEN42';

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
  notificationShow.mockClear();
  showNativePush.mockClear();
  showNativePush.mockResolvedValue('notification-id');
  topFrameStillHostsRequest.mockReset();
});

describe('deliverTokenNotificationFallback', () => {
  it('shows the copy-to-clipboard token notification in the top frame when the top frame is safe', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: true });
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(sendMessage).toHaveBeenCalledWith(
      TAB,
      { action: 'showTokenNotification', token: TOKEN, token_request_id: REQ },
      { frameId: 0 }
    );
    expect(storeLog).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
    expect(showNativePush).not.toHaveBeenCalled();
  });

  it('Z1: withholds the token silently when the top frame origin changed (post-login redirect)', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: false, reason: 'originChanged' });
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
    expect(showNativePush).not.toHaveBeenCalled();
  });

  it('superseded: withholds the token, logs info 61 and notifies the user (native/front-end per setting)', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: false, reason: 'superseded' });
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('info', 61, expect.any(Error), 'handleLoginRequest');
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.OldRequest, TAB);
  });

  it('superseded: a failed user notification is swallowed (best-effort), token stays withheld', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: false, reason: 'superseded' });
    notificationShow.mockRejectedValueOnce(new Error('no content script'));
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await expect(deliverTokenNotificationFallback(TAB, TOKEN, REQ)).resolves.toBeUndefined();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('lookupFailed: withholds the token and logs warning 62 with the real error', async () => {
    const boom = new Error('session storage read failed');
    topFrameStillHostsRequest.mockResolvedValue({ safe: false, reason: 'lookupFailed', error: boom });
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'ok' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('warning', 62, boom, 'handleLoginRequest');
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('F1: never surfaces the token via a native notification — logs 58 (real failure in cause) and shows a token-free recovery push', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: true });
    vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(new Error('no content script'));

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(storeLog).toHaveBeenCalledWith(
      'warning',
      58,
      expect.objectContaining({
        message: expect.stringContaining('withheld'),
        cause: 'no content script'
      }),
      'handleLoginRequest'
    );
    expect(showNativePush).toHaveBeenCalledWith(config.Texts.Error.TokenNotDelivered, false);
    // The recovery push must not carry the token.
    expect(JSON.stringify(showNativePush.mock.calls)).not.toContain(TOKEN);
  });

  it('logs 58 with the response status as cause when the content script responds with a non-ok status', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: true });
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ status: 'error', message: 'DOM exploded' });

    await deliverTokenNotificationFallback(TAB, TOKEN, REQ);

    expect(storeLog).toHaveBeenCalledWith(
      'warning',
      58,
      expect.objectContaining({ cause: 'content script responded with status: error (DOM exploded)' }),
      'handleLoginRequest'
    );
    expect(showNativePush).toHaveBeenCalledWith(config.Texts.Error.TokenNotDelivered, false);
  });

  it('a failed recovery push is swallowed — delivery still resolves', async () => {
    topFrameStillHostsRequest.mockResolvedValue({ safe: true });
    vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(new Error('no content script'));
    showNativePush.mockRejectedValueOnce(new Error('notifications unavailable'));

    await expect(deliverTokenNotificationFallback(TAB, TOKEN, REQ)).resolves.toBeUndefined();
  });
});
