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

// scheduleAutoSubmit orchestrates getTabData + the pendingSubmit queue; stub both
// so the ordering can be asserted without a DOM.
const getTabDataMock = vi.fn();
vi.mock('@content/functions/getTabData.js', () => ({ default: () => getTabDataMock() }));

const setPendingSubmitMock = vi.fn();
const resumePendingSubmitMock = vi.fn();
const clearPendingSubmitMock = vi.fn();
const consumeLoadCompleteSignalMock = vi.fn(() => false);
vi.mock('@content/functions/pendingSubmit.js', () => ({
  setPendingSubmit: (...args) => setPendingSubmitMock(...args),
  resumePendingSubmit: (...args) => resumePendingSubmitMock(...args),
  clearPendingSubmit: (...args) => clearPendingSubmitMock(...args),
  consumeLoadCompleteSignal: (...args) => consumeLoadCompleteSignalMock(...args),
  MAX_PENDING_SUBMIT_AGE_MS: 15000
}));

const { keystrokeDelay, scheduleAutoSubmit } = await import('./inputToken.js');

describe('keystrokeDelay (U3 adaptive typing rhythm)', () => {
  it('uses a fast base cadence (~30-50ms) for a single field', () => {
    const base = keystrokeDelay(false);

    expect(base).toBeGreaterThanOrEqual(30);
    expect(base).toBeLessThanOrEqual(50);
  });

  it('rises for segmented OTP widgets so they can re-render between boxes', () => {
    expect(keystrokeDelay(true)).toBeGreaterThan(keystrokeDelay(false));
  });
});

describe('scheduleAutoSubmit (U5 deferred auto-submit ordering)', () => {
  beforeEach(() => {
    getTabDataMock.mockReset();
    setPendingSubmitMock.mockReset();
    resumePendingSubmitMock.mockReset();
    clearPendingSubmitMock.mockReset();
    consumeLoadCompleteSignalMock.mockReset();
    consumeLoadCompleteSignalMock.mockReturnValue(false);
  });

  it('queues the submit BEFORE awaiting the tab status, so a pageLoadComplete during the await is not lost', async () => {
    let resolveTab;
    getTabDataMock.mockReturnValue(new Promise(resolve => { resolveTab = resolve; }));
    const input = { isConnected: true };

    const pending = scheduleAutoSubmit(input, 'https://example.test', true);

    // The queue is set synchronously, before getTabData resolves — this is the
    // whole point of the fix: a pageLoadComplete arriving mid-await finds a
    // non-empty queue.
    expect(setPendingSubmitMock).toHaveBeenCalledWith(input, 'https://example.test');
    expect(resumePendingSubmitMock).not.toHaveBeenCalled();

    resolveTab({ status: 'complete' });
    await pending;
  });

  it('replays-and-clears immediately when the page is already complete', async () => {
    getTabDataMock.mockResolvedValue({ status: 'complete' });

    await scheduleAutoSubmit({ isConnected: true }, 'https://example.test', true);

    expect(setPendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(resumePendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(clearPendingSubmitMock).not.toHaveBeenCalled();
  });

  it('replays immediately (without waiting on getTabData) when a pageLoadComplete was latched mid-fill', async () => {
    // A 'pageLoadComplete' arrived while the fill was still typing; the queue was
    // armed only after. The latch must trigger the submit without depending on
    // the getTabData status read at all.
    consumeLoadCompleteSignalMock.mockReturnValue(true);
    getTabDataMock.mockRejectedValue(new Error('getTabData must not be needed'));

    await scheduleAutoSubmit({ isConnected: true }, 'https://example.test', true);

    expect(setPendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(resumePendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(getTabDataMock).not.toHaveBeenCalled();
    expect(clearPendingSubmitMock).not.toHaveBeenCalled();
  });

  it('leaves the submit queued (does not replay) while the page is still loading', async () => {
    getTabDataMock.mockResolvedValue({ status: 'loading' });

    await scheduleAutoSubmit({ isConnected: true }, 'https://example.test', true);

    expect(setPendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(resumePendingSubmitMock).not.toHaveBeenCalled();
    expect(clearPendingSubmitMock).not.toHaveBeenCalled();
  });

  it('does not queue anything when the fill was not verified', async () => {
    getTabDataMock.mockResolvedValue({ status: 'loading' });

    await scheduleAutoSubmit({ isConnected: true }, 'https://example.test', false);

    expect(setPendingSubmitMock).not.toHaveBeenCalled();
    expect(resumePendingSubmitMock).not.toHaveBeenCalled();
  });

  it('drops the queued submit when the tab status cannot be read', async () => {
    getTabDataMock.mockRejectedValue(new Error('no tab'));

    await scheduleAutoSubmit({ isConnected: true }, 'https://example.test', true);

    expect(setPendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(clearPendingSubmitMock).toHaveBeenCalledTimes(1);
    expect(resumePendingSubmitMock).not.toHaveBeenCalled();
  });
});
