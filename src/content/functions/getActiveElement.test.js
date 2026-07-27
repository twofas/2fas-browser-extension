// @vitest-environment jsdom
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

vi.mock('uuid', () => ({ v4: () => 'fixed-uuid' }));
vi.mock('@content/functions/clearFormElementsNumber.js', () => ({ default: vi.fn() }));
vi.mock('@content/functions/addFormElementsNumber.js', () => ({ default: vi.fn() }));
vi.mock('@content/functions/getFormElements.js', () => ({ default: () => [] }));

const activeElementRef = { current: null };
const fallbackRef = { current: null };

vi.mock('@content/functions/shadowDomUtils.js', () => ({
  getDeepActiveElement: () => activeElementRef.current,
  collectAllShadowRoots: () => []
}));

const findFallbackOtpInput = vi.fn(() => fallbackRef.current);
vi.mock('@content/functions/findFallbackOtpInput.js', () => ({ default: (...a) => findFallbackOtpInput(...a) }));

import getActiveElement from './getActiveElement.js';

beforeEach(() => {
  document.body.innerHTML = '';
  activeElementRef.current = null;
  fallbackRef.current = null;
  findFallbackOtpInput.mockClear();
});

describe('getActiveElement — matchType', () => {
  it('marks a genuinely focused input as "focused" and tags it', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    activeElementRef.current = input;

    const res = getActiveElement();

    expect(res.matchType).toBe('focused');
    expect(res.id).toBe('fixed-uuid');
    expect(input.getAttribute('data-twofas-input')).toBe('fixed-uuid');
    expect(findFallbackOtpInput).not.toHaveBeenCalled();
  });

  it('marks a one-time-code fallback match as "fallback"', () => {
    const body = document.body; // not fillable, not a frame
    activeElementRef.current = body;
    const otp = document.createElement('input');
    fallbackRef.current = otp;

    const res = getActiveElement();

    expect(findFallbackOtpInput).toHaveBeenCalledTimes(1);
    expect(res.matchType).toBe('fallback');
    expect(res.id).toBe('fixed-uuid');
  });

  it('skips the fallback when focus is delegated to a child frame (active element is an iframe)', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    activeElementRef.current = iframe;
    fallbackRef.current = document.createElement('input'); // would-be fallback

    const res = getActiveElement();

    // The child frame reports its own focused field; this (parent) frame must NOT
    // produce a fallback that could win the frame-0 preference (Z4).
    expect(findFallbackOtpInput).not.toHaveBeenCalled();
    expect(res.matchType).toBeNull();
    expect(res.id).toBeNull();
  });

  it('returns a null target (matchType null) when nothing focused and no fallback', () => {
    activeElementRef.current = document.body;
    fallbackRef.current = null;

    const res = getActiveElement();

    expect(res.id).toBeNull();
    expect(res.matchType).toBeNull();
  });
});
