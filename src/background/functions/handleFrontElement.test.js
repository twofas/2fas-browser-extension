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

const notifShow = vi.fn().mockResolvedValue(undefined);
vi.mock('@notification/index.js', () => ({ default: { show: (...a) => notifShow(...a) } }));

import handleFrontElement from './handleFrontElement.js';
import { loadFromSessionStorage } from '@sessionStorage/index.js';

const TAB = 11;

const activeEl = (frameId, id, matchType, url) => ({ frameId, url, response: { id, matchType } });

const getTabData = async () => {
  const data = await loadFromSessionStorage([`tabData-${TAB}`]);
  return data[`tabData-${TAB}`];
};

beforeEach(() => {
  notifShow.mockClear();
});

describe('handleFrontElement — frame selection (Z4)', () => {
  it('prefers a sub-frame with a REAL focused field over a top-frame one-time-code fallback', async () => {
    const elements = [
      activeEl(0, 'top-fallback', 'fallback', 'https://top.test/login'),
      activeEl(5, 'sub-focused', 'focused', 'https://idp.test/otp')
    ];

    await handleFrontElement(elements, TAB, {});

    const tabData = await getTabData();
    expect(tabData.lastFocusedInput).toBe('sub-focused');
    expect(tabData.lastFocusedFrameId).toBe(5);
    expect(tabData.lastFocusedFrameOrigin).toBe('https://idp.test');
    expect(tabData.lastFocusedFrameUrl).toBe('https://idp.test/otp');
    expect(notifShow).toHaveBeenCalledTimes(1);
  });

  it('prefers the top frame among same-precedence (all fallback) matches', async () => {
    const elements = [
      activeEl(6, 'sub-fallback', 'fallback', 'https://a.test/x'),
      activeEl(0, 'top-fallback', 'fallback', 'https://top.test/login')
    ];

    await handleFrontElement(elements, TAB, {});

    const tabData = await getTabData();
    expect(tabData.lastFocusedFrameId).toBe(0);
    expect(tabData.lastFocusedInput).toBe('top-fallback');
  });

  it('records the frame URL for opaque-origin re-verification (Z7)', async () => {
    const elements = [activeEl(4, 'srcdoc-input', 'focused', 'about:srcdoc')];

    await handleFrontElement(elements, TAB, {});

    const tabData = await getTabData();
    expect(tabData.lastFocusedFrameUrl).toBe('about:srcdoc');
    // about:srcdoc has an opaque (non-usable) origin.
    expect(tabData.lastFocusedFrameOrigin).toBe('null');
  });

  it('clears the recorded frame fields (incl. URL) and shows the clipboard fallback when nothing is fillable', async () => {
    const seeded = { lastFocusedInput: 'old', lastFocusedFrameId: 2, lastFocusedFrameOrigin: 'https://o.test', lastFocusedFrameUrl: 'https://o.test/x' };

    await handleFrontElement([], TAB, { [`tabData-${TAB}`]: seeded });

    const tabData = await getTabData();
    expect(tabData.lastFocusedInput).toBeUndefined();
    expect(tabData.lastFocusedFrameId).toBeUndefined();
    expect(tabData.lastFocusedFrameOrigin).toBeUndefined();
    expect(tabData.lastFocusedFrameUrl).toBeUndefined();
    expect(notifShow).toHaveBeenCalledTimes(1);
  });
});
