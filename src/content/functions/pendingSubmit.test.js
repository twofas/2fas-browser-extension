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

// clickSubmit pulls in DOM/browser-only helpers; the deferred-submit queue only
// needs to know that it eventually fires it, so stub it with a spy.
const clickSubmitMock = vi.fn();
vi.mock('@content/functions/clickSubmit.js', () => ({ default: (...args) => clickSubmitMock(...args) }));

const {
  setPendingSubmit,
  resumePendingSubmit,
  clearPendingSubmit,
  consumeLoadCompleteSignal,
  MAX_PENDING_SUBMIT_AGE_MS
} = await import('./pendingSubmit.js');

describe('pendingSubmit (U5 deferred auto-submit)', () => {
  beforeEach(() => {
    clearPendingSubmit();
    clickSubmitMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing and reports false when no submit is queued', () => {
    expect(resumePendingSubmit()).toBe(false);
    expect(clickSubmitMock).not.toHaveBeenCalled();
  });

  describe('load-complete latch (mid-fill race)', () => {
    it('latches a resume that arrives with an empty queue and exposes it once', () => {
      // pageLoadComplete fired mid-fill, before the queue was armed.
      expect(resumePendingSubmit()).toBe(false);
      expect(clickSubmitMock).not.toHaveBeenCalled();

      // The signal is remembered, then consumed exactly once.
      expect(consumeLoadCompleteSignal()).toBe(true);
      expect(consumeLoadCompleteSignal()).toBe(false);
    });

    it('reports no latched signal when nothing fired', () => {
      expect(consumeLoadCompleteSignal()).toBe(false);
    });

    it('clearPendingSubmit resets the latch (scoped to one fill cycle)', () => {
      resumePendingSubmit(); // latch it
      clearPendingSubmit();
      expect(consumeLoadCompleteSignal()).toBe(false);
    });
  });

  it('fires the queued submit with the stored element and URL on resume', () => {
    const input = { tag: 'input', isConnected: true };

    setPendingSubmit(input, 'https://example.test/login');

    expect(resumePendingSubmit()).toBe(true);
    expect(clickSubmitMock).toHaveBeenCalledTimes(1);
    expect(clickSubmitMock).toHaveBeenCalledWith(input, 'https://example.test/login');
  });

  it('resumes only once — a second resume is a no-op', () => {
    setPendingSubmit({ tag: 'input', isConnected: true }, 'https://example.test/login');

    expect(resumePendingSubmit()).toBe(true);
    expect(resumePendingSubmit()).toBe(false);
    expect(clickSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('keeps only the most recent queued submit', () => {
    const first = { tag: 'first', isConnected: true };
    const second = { tag: 'second', isConnected: true };

    setPendingSubmit(first, 'https://first.test');
    setPendingSubmit(second, 'https://second.test');

    resumePendingSubmit();

    expect(clickSubmitMock).toHaveBeenCalledTimes(1);
    expect(clickSubmitMock).toHaveBeenCalledWith(second, 'https://second.test');
  });

  it('drops a submit whose input was detached during load instead of clicking a stray button', () => {
    setPendingSubmit({ tag: 'input', isConnected: false }, 'https://example.test/login');

    expect(resumePendingSubmit()).toBe(false);
    expect(clickSubmitMock).not.toHaveBeenCalled();
  });

  it('drops a stale submit instead of firing an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    setPendingSubmit({ tag: 'input', isConnected: true }, 'https://example.test/login');

    vi.setSystemTime(MAX_PENDING_SUBMIT_AGE_MS + 1);

    expect(resumePendingSubmit()).toBe(false);
    expect(clickSubmitMock).not.toHaveBeenCalled();
  });

  it('still fires a submit queued within the freshness window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    setPendingSubmit({ tag: 'input', isConnected: true }, 'https://example.test/login');

    vi.setSystemTime(MAX_PENDING_SUBMIT_AGE_MS - 1);

    expect(resumePendingSubmit()).toBe(true);
    expect(clickSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('clearPendingSubmit discards a queued submit', () => {
    setPendingSubmit({ tag: 'input', isConnected: true }, 'https://example.test/login');

    clearPendingSubmit();

    expect(resumePendingSubmit()).toBe(false);
    expect(clickSubmitMock).not.toHaveBeenCalled();
  });
});
