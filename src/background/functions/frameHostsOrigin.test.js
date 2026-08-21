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

import frameHostsOrigin from './frameHostsOrigin.js';

const TAB = 3;

beforeEach(() => {
  vi.restoreAllMocks();
  storeLog.mockClear();
});

describe('frameHostsOrigin', () => {
  it('is true when the frame still hosts the expected origin', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://site.test/login' });

    expect(await frameHostsOrigin(TAB, 0, 'https://site.test')).toBe(true);
    expect(storeLog).not.toHaveBeenCalled();
  });

  it('is false and logs 51 as info when the frame navigated to a different origin', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://evil.test/x' });

    expect(await frameHostsOrigin(TAB, 2, 'https://site.test')).toBe(false);
    expect(storeLog).toHaveBeenCalledWith('info', 51, expect.any(Error), 'resolveTokenTargetFrame');

    const err = storeLog.mock.calls[0][2];
    expect(err.cause).toEqual({ wasTopFrame: false, currentOriginNull: false });
  });

  it('marks a gone frame (getFrame resolves null) as currentOriginNull in the 51 cause', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue(null);

    expect(await frameHostsOrigin(TAB, 0, 'https://site.test')).toBe(false);
    expect(storeLog).toHaveBeenCalledWith('info', 51, expect.any(Error), 'resolveTokenTargetFrame');

    const err = storeLog.mock.calls[0][2];
    expect(err.cause).toEqual({ wasTopFrame: true, currentOriginNull: true });
  });

  it('is false when the frame URL cannot be parsed (opaque)', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'not a valid url' });

    expect(await frameHostsOrigin(TAB, 0, 'https://site.test')).toBe(false);
  });

  it('is false when the expected origin is not usable', async () => {
    vi.spyOn(browser.webNavigation, 'getFrame').mockResolvedValue({ url: 'https://site.test/login' });

    expect(await frameHostsOrigin(TAB, 0, 'null')).toBe(false);
  });

  it('is false and logs 68 when the frame lookup throws — constant message, raw rejection in cause', async () => {
    const boom = new Error('Invalid call to webNavigation.getFrame(). Tab not found.');
    vi.spyOn(browser.webNavigation, 'getFrame').mockRejectedValue(boom);

    expect(await frameHostsOrigin(TAB, 0, 'https://site.test')).toBe(false);
    expect(storeLog).toHaveBeenCalledWith('warning', 68, expect.any(Error), 'resolveTokenTargetFrame - frame lookup failed');

    const err = storeLog.mock.calls[0][2];
    expect(err.message).toBe('Frame lookup failed');
    expect(err.cause).toBe(boom);
  });
});
