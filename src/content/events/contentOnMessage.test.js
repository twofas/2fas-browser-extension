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

const mocks = vi.hoisted(() => ({
  inputToken: vi.fn(),
  getTokenInput: vi.fn(),
  findFallbackOtpInput: vi.fn(),
  tokenNotification: vi.fn(),
  isInFrame: vi.fn(() => false),
  checkCrossDomain: vi.fn(() => ({ isCrossDomain: false })),
  notification: vi.fn(),
  loadFonts: vi.fn(),
  getActiveElement: vi.fn(),
  resumePendingSubmit: vi.fn()
}));
vi.mock('@content/functions', () => mocks);
vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import contentOnMessage from './contentOnMessage.js';

const TAB = 3;
const REQ = 'req-1';

// Drives the async 'inputToken' branch and resolves with the response.
const deliver = (request, tabData, isTopFrame = true) => new Promise(resolve => {
  contentOnMessage(request, {}, resolve, tabData, isTopFrame);
});

const withSession = tabRecord => {
  vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
    status: 'ok',
    data: { [`tabData-${TAB}`]: tabRecord }
  });
};

beforeEach(() => {
  vi.restoreAllMocks();
  Object.values(mocks).forEach(fn => fn.mockReset?.());
  mocks.isInFrame.mockReturnValue(false);
  mocks.checkCrossDomain.mockReturnValue({ isCrossDomain: false });
});

describe('contentOnMessage — inputToken delivery', () => {
  it('fills the tagged input when it is still present', async () => {
    withSession({ requestID: REQ, lastFocusedInput: 'uuid-1' });
    const el = { removeAttribute: vi.fn() };
    mocks.getTokenInput.mockReturnValue(el);
    mocks.inputToken.mockResolvedValue({ status: 'completed' });

    const res = await deliver({ action: 'inputToken', token: '123456', token_request_id: REQ }, { id: TAB, url: 'https://x.test' });

    expect(mocks.inputToken).toHaveBeenCalledWith(expect.any(Object), el, 'https://x.test');
    expect(res).toEqual({ status: 'completed' });
  });

  it('re-searches for a fresh target when the tagged node was removed (T8)', async () => {
    withSession({ requestID: REQ, lastFocusedInput: 'uuid-gone' });
    mocks.getTokenInput.mockReturnValue(null); // tagged node gone
    const fresh = { removeAttribute: vi.fn() };
    mocks.findFallbackOtpInput.mockReturnValue(fresh);
    mocks.inputToken.mockResolvedValue({ status: 'completed' });

    const res = await deliver({ action: 'inputToken', token: '123456', token_request_id: REQ }, { id: TAB, url: 'https://x.test' });

    expect(mocks.findFallbackOtpInput).toHaveBeenCalledTimes(1);
    expect(mocks.inputToken).toHaveBeenCalledWith(expect.any(Object), fresh, 'https://x.test');
    expect(res).toEqual({ status: 'completed' });
  });

  it('shows the copy notification (top frame) when no target can be found', async () => {
    withSession({ requestID: REQ, lastFocusedInput: 'uuid-gone' });
    mocks.getTokenInput.mockReturnValue(null);
    mocks.findFallbackOtpInput.mockReturnValue(null);

    const res = await deliver({ action: 'inputToken', token: '999888', token_request_id: REQ }, { id: TAB, url: 'https://x.test' });

    expect(mocks.tokenNotification).toHaveBeenCalledWith('999888', REQ);
    expect(res).toEqual({ status: 'ok' });
    expect(mocks.inputToken).not.toHaveBeenCalled();
  });

  it('returns a plain non-completed status (not the dead {status:notification}) on a stale request', async () => {
    withSession({ requestID: 'a-different-request', lastFocusedInput: 'uuid-1' });

    const res = await deliver({ action: 'inputToken', token: '123456', token_request_id: REQ }, { id: TAB, url: 'https://x.test' });

    // Non-'completed' → background shows the token notification uniformly; no dead
    // title/message error shape.
    expect(res).toEqual({ status: 'ok' });
    expect(res.title).toBeUndefined();
    expect(mocks.inputToken).not.toHaveBeenCalled();
  });

  it('omits (defers to background frame-0 fallback) when no target is found in a sub-frame', async () => {
    mocks.isInFrame.mockReturnValue(true);
    withSession({ requestID: REQ, lastFocusedInput: 'uuid-gone' });
    mocks.getTokenInput.mockReturnValue(null);
    mocks.findFallbackOtpInput.mockReturnValue(null);

    const res = await deliver({ action: 'inputToken', token: '123456', token_request_id: REQ }, { id: TAB, url: 'https://x.test' }, false);

    expect(res).toEqual({ status: 'omitted' });
    expect(mocks.tokenNotification).not.toHaveBeenCalled();
  });
});
