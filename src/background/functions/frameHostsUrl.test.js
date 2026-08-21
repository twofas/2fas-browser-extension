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

import frameHostsUrl from './frameHostsUrl.js';

const TAB = 4;

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
});

describe('frameHostsUrl', () => {
  it('is true when the frame still hosts the exact URL', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'about:srcdoc' });

    expect(await frameHostsUrl(TAB, 5, 'about:srcdoc')).toBe(true);
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('is false and logs 51 as info when the frame URL changed', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'data:text/html,b' });

    expect(await frameHostsUrl(TAB, 5, 'data:text/html,a')).toBe(false);
    expect(storeLog).toHaveBeenCalledWith('info', 51, expect.any(Error), 'resolveTokenTargetFrame');

    const err = storeLog.mock.calls[0][2];
    expect(err.cause).toEqual({ wasTopFrame: false, currentUrlEmpty: false });
  });

  it('is false when the frame has no URL', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({});

    expect(await frameHostsUrl(TAB, 5, 'about:srcdoc')).toBe(false);
  });

  it('is false and logs 68 when the frame lookup throws — constant message, raw rejection in cause', async () => {
    const boom = new Error('no frame');
    vi.spyOn(browser.webNavigation, 'getFrame').mockRejectedValue(boom);

    expect(await frameHostsUrl(TAB, 5, 'about:srcdoc')).toBe(false);
    expect(storeLog).toHaveBeenCalledWith('warning', 68, expect.any(Error), 'resolveTokenTargetFrame - opaque frame lookup failed');

    const err = storeLog.mock.calls[0][2];
    expect(err.message).toBe('Opaque frame lookup failed');
    expect(err.cause).toBe(boom);
  });
});
