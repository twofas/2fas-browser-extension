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

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import storeLog from '@partials/storeLog.js';
import resolveTokenTargetFrame from './resolveTokenTargetFrame.js';

const TAB = 7;

const setTabData = data => saveToSessionStorage({ [`tabData-${TAB}`]: data });

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
});

describe('resolveTokenTargetFrame — focus-less request (no recorded frame)', () => {
  it('withholds (null) and logs info 51 when the request record was wiped mid-flight', async () => {
    await setTabData({});

    expect(await resolveTokenTargetFrame(TAB)).toBeNull();
    expect(storeLog).toHaveBeenCalledWith('info', 51, expect.any(Error), 'resolveTokenTargetFrame');

    const err = storeLog.mock.calls[0][2];
    expect(err.cause).toEqual({ hadRecordedFrame: false });
  });

  it('delivers to the top frame while it still hosts the request origin', async () => {
    await setTabData({ origin: 'https://example.test' });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://example.test/login' });
    expect(await resolveTokenTargetFrame(TAB)).toBe(0);
  });

  it('delivers nowhere (null) when the top frame navigated to a different origin', async () => {
    await setTabData({ origin: 'https://example.test' });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://evil.test/login' });
    expect(await resolveTokenTargetFrame(TAB)).toBeNull();
  });
});

describe('resolveTokenTargetFrame — recorded sub-frame (usable origin)', () => {
  it('delivers to the recorded frame while it still hosts the recorded origin', async () => {
    await setTabData({ lastFocusedFrameId: 3, lastFocusedFrameOrigin: 'https://idp.test' });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://idp.test/otp' });
    expect(await resolveTokenTargetFrame(TAB)).toBe(3);
  });

  it('delivers nowhere (null) when the recorded frame changed origin', async () => {
    await setTabData({ lastFocusedFrameId: 3, lastFocusedFrameOrigin: 'https://idp.test' });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://other.test/otp' });
    expect(await resolveTokenTargetFrame(TAB)).toBeNull();
  });
});

describe('resolveTokenTargetFrame — opaque-origin sub-frame (Z7)', () => {
  it('delivers to the recorded opaque frame when its exact URL is unchanged', async () => {
    await setTabData({ lastFocusedFrameId: 4, lastFocusedFrameOrigin: 'null', lastFocusedFrameUrl: 'about:srcdoc' });
    const spy = vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'about:srcdoc' });

    expect(await resolveTokenTargetFrame(TAB)).toBe(4);
    expect(spy).toHaveBeenCalledWith({ tabId: TAB, frameId: 4 });
  });

  it('delivers nowhere (null) when the opaque frame URL changed', async () => {
    await setTabData({ lastFocusedFrameId: 4, lastFocusedFrameOrigin: 'null', lastFocusedFrameUrl: 'data:text/html,a' });
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'data:text/html,b' });
    expect(await resolveTokenTargetFrame(TAB)).toBeNull();
  });

  it('withholds (null) and logs info 51 for a recorded frame with neither origin nor URL', async () => {
    await setTabData({ lastFocusedFrameId: 4, lastFocusedFrameOrigin: 'null' });

    expect(await resolveTokenTargetFrame(TAB)).toBeNull();
    expect(storeLog).toHaveBeenCalledWith('info', 51, expect.any(Error), 'resolveTokenTargetFrame');

    const err = storeLog.mock.calls[0][2];
    expect(err.cause).toEqual({ hadRecordedFrame: true });
  });
});
