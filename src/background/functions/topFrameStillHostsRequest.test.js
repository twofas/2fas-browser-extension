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
  it('is safe when the top frame still hosts the request origin', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://site.test/login' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: true });
  });

  it('reports originChanged when the top frame navigated to a different origin (Z1)', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://evil.test/x' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: false, reason: 'originChanged' });
  });

  it('reports originChanged when the top frame origin is not comparable (mid-navigation)', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'about:blank' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: false, reason: 'originChanged' });
  });

  it('reports superseded when a newer request took over the tab (requestID mismatch)', async () => {
    await setTabData({ origin: 'https://site.test', requestID: 'a-newer-request' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: false, reason: 'superseded' });
  });

  it('withholds (originChanged) when the record was wiped mid-flight — no comparable request origin', async () => {
    await setTabData({ requestID: REQ });
    const spy = vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://site.test/login' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: false, reason: 'originChanged' });
    // Withheld before the frame lookup — an http(s) top frame must not re-enable
    // the old unverified allowance.
    expect(spy).not.toHaveBeenCalled();
  });

  it('withholds (originChanged) for a fully wiped record even on an ordinary web page', async () => {
    await setTabData({});
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://site.test/login' });

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: false, reason: 'originChanged' });
  });

  it('reports lookupFailed with the real error and the frameLookup stage when the frame lookup throws', async () => {
    await setTabData({ origin: 'https://site.test', requestID: REQ });
    const boom = new Error('no frame');
    vi.spyOn(browser.webNavigation, 'getFrame').mockRejectedValue(boom);

    expect(await topFrameStillHostsRequest(TAB, REQ)).toEqual({ safe: false, reason: 'lookupFailed', stage: 'frameLookup', error: boom });
  });

  it('reports lookupFailed with the sessionRead stage when the session storage read throws', async () => {
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('session storage read failed'));

    // loadFromSessionStorage wraps the raw error, so assert shape rather than identity.
    const verdict = await topFrameStillHostsRequest(TAB, REQ);
    expect(verdict).toMatchObject({ safe: false, reason: 'lookupFailed', stage: 'sessionRead' });
    expect(verdict.error).toBeInstanceOf(Error);
  });
});
