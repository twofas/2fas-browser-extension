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
import { saveToSessionStorage } from '@sessionStorage/index.js';

import topFrameStillHostsRequest from './topFrameStillHostsRequest.js';

const TAB = 5;
const REQ = 'req-1';

const setTabData = data => saveToSessionStorage({ [`tabData-${TAB}`]: data });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('topFrameStillHostsRequest', () => {
  it('is true when the top frame still hosts the request origin', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://site.test/login' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toBe(true);
  });

  it('is false when the top frame navigated to a different origin (Z1)', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://evil.test/x' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toBe(false);
  });

  it('is false when the request was superseded (requestID mismatch)', async () => {
    await setTabData({ origin: 'https://site.test', requestID: 'a-newer-request' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toBe(false);
  });

  it('is true (legacy) when no comparable request origin is recorded', async () => {
    await setTabData({ requestID: REQ });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toBe(true);
  });

  it('is false when the frame lookup throws', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    vi.spyOn(browser.webNavigation, 'getFrame').mockRejectedValue(new Error('no frame'));

    expect(await topFrameStillHostsRequest(TAB, REQ)).toBe(false);
  });
});
