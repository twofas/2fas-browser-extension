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
import config from '@/config.js';
import { saveToSessionStorage } from '@sessionStorage/index.js';

const storeLog = vi.fn().mockResolvedValue(undefined);
vi.mock('@partials/storeLog.js', () => ({ default: (...a) => storeLog(...a) }));

const closeRequest = vi.fn().mockResolvedValue(undefined);
vi.mock('@background/functions/closeRequest.js', () => ({ default: (...a) => closeRequest(...a) }));

const notificationShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notificationShow(...a) } }));

const showNativePush = vi.fn().mockResolvedValue('id');
vi.mock('@notification/functions', () => ({ showNativePush: (...a) => showNativePush(...a) }));

vi.mock('@background/functions/Crypt.js', () => ({
  default: class {
    stringToArrayBuffer () { return new ArrayBuffer(0); }
    decrypt () { return Promise.resolve(new ArrayBuffer(0)); }
    decodeText () { return 'TOKEN42'; }
  }
}));

vi.mock('@background/functions/privateKeyStore.js', () => ({ getOrMigratePrivateKey: vi.fn().mockResolvedValue({}) }));
vi.mock('@background/functions/syncDevicesWithAPI.js', () => ({ default: vi.fn().mockResolvedValue({ storage: { devices: [] } }) }));

const resolveTokenTargetFrame = vi.fn();
vi.mock('@background/functions/resolveTokenTargetFrame.js', () => ({ default: (...a) => resolveTokenTargetFrame(...a) }));

import handleLoginRequest from './handleLoginRequest.js';

const TAB = 9;
const REQ = 'req-1';
const DATA = { token: 'enc', token_request_id: REQ };

let inputTokenResponse;
let showTokenBehavior;

const setup = async ({ tabData, frameUrl } = {}) => {
  await saveToSessionStorage({ [`tabData-${TAB}`]: tabData ?? { origin: 'https://site.test', requestID: REQ } });
  vi.spyOn(browser.tabs, 'get').mockResolvedValue({});
  vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: frameUrl ?? 'https://site.test/login' });
  vi.spyOn(browser.tabs, 'sendMessage').mockImplementation(async (tabId, msg) => {
    if (msg.action === 'inputToken') {
      return inputTokenResponse;
    }

    if (msg.action === 'showTokenNotification') {
      if (showTokenBehavior === 'reject') {
        throw new Error('no content script');
      }

      return { status: showTokenBehavior === 'omitted' ? 'omitted' : 'ok' };
    }

    return {};
  });
};

const sentActions = () => browser.tabs.sendMessage.mock.calls.map(c => c[1].action);

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
  closeRequest.mockClear();
  showNativePush.mockClear();
  notificationShow.mockClear();
  resolveTokenTargetFrame.mockReset();
  inputTokenResponse = { status: 'completed' };
  showTokenBehavior = 'ok';
});

describe('handleLoginRequest — token delivery tail', () => {
  it('autofills and shows NO fallback notification when the fill completes', async () => {
    resolveTokenTargetFrame.mockResolvedValue(0);
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).toEqual(['inputToken']);
    expect(showNativePush).not.toHaveBeenCalled();
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
  });

  it('shows the token notification in the top frame when the fill did not complete', async () => {
    resolveTokenTargetFrame.mockResolvedValue(3);
    inputTokenResponse = { status: 'unverified' };
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).toEqual(['inputToken', 'showTokenNotification']);
    expect(browser.tabs.sendMessage.mock.calls[1][1].token).toBe('TOKEN42');
    expect(showNativePush).not.toHaveBeenCalled();
  });

  it('Z2: shows the token notification when there is no safe target frame (null)', async () => {
    resolveTokenTargetFrame.mockResolvedValue(null);
    await setup();

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).toEqual(['showTokenNotification']);
    expect(browser.tabs.sendMessage.mock.calls[0][1].token).toBe('TOKEN42');
  });

  it('F1: NEVER surfaces the token via a native OS notification — drops it and logs when the front-end notification cannot be delivered', async () => {
    resolveTokenTargetFrame.mockResolvedValue(0);
    inputTokenResponse = { status: 'unverified' };
    showTokenBehavior = 'reject';
    await setup();

    await handleLoginRequest(TAB, DATA);

    // The front-end token notification was attempted (and rejected) ...
    expect(sentActions()).toEqual(['inputToken', 'showTokenNotification']);
    // ... but the token is NEVER pushed to a native OS notification.
    expect(showNativePush).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('warning', 58, expect.objectContaining({ message: expect.stringContaining('withheld') }), 'handleLoginRequest');
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
  });

  it('Z1: withholds the token SILENTLY (no notification, no log) when the top frame navigated to a different origin', async () => {
    resolveTokenTargetFrame.mockResolvedValue(null);
    await setup({ tabData: { origin: 'https://site.test', requestID: REQ }, frameUrl: 'https://evil.test/x' });

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).not.toContain('showTokenNotification');
    expect(showNativePush).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
    expect(storeLog).not.toHaveBeenCalled();
    expect(closeRequest).toHaveBeenCalledWith(TAB, REQ);
  });

  it('Z1: withholds the token, logs info 61 and notifies the user when the request was superseded (requestID mismatch)', async () => {
    resolveTokenTargetFrame.mockResolvedValue(null);
    await setup({ tabData: { origin: 'https://site.test', requestID: 'a-newer-request' } });

    await handleLoginRequest(TAB, DATA);

    expect(sentActions()).not.toContain('showTokenNotification');
    expect(showNativePush).not.toHaveBeenCalled();
    expect(storeLog).toHaveBeenCalledWith('info', 61, expect.any(Error), 'handleLoginRequest');
    expect(notificationShow).toHaveBeenCalledWith(config.Texts.Error.OldRequest, TAB);
  });
});
