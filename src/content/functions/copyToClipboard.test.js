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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import copyToClipboard from './copyToClipboard.js';

const setClipboard = value => {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
};

beforeEach(() => {
  document.body.replaceChildren();
  setClipboard(undefined);
  document.execCommand = vi.fn(() => false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('copyToClipboard', () => {
  it('uses the async Clipboard API when available and returns true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    const ok = await copyToClipboard('123456');

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('123456');
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when navigator.clipboard is undefined (http://)', async () => {
    document.execCommand = vi.fn(() => true);

    const ok = await copyToClipboard('654321');

    expect(ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when the async write rejects, and reports its result', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('not focused')) });
    document.execCommand = vi.fn(() => true);

    const ok = await copyToClipboard('999000');

    expect(ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false when both the async API and execCommand fail (never a false success)', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('blocked')) });
    document.execCommand = vi.fn(() => false);

    const ok = await copyToClipboard('111222');

    expect(ok).toBe(false);
  });

  it('cleans up its temporary textarea after the fallback', async () => {
    document.execCommand = vi.fn(() => true);

    await copyToClipboard('333444');

    expect(document.querySelectorAll('textarea').length).toBe(0);
  });
});
