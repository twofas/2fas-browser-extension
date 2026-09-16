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
import browser from 'webextension-polyfill';
import { getClockOffsetMs, noteServerDate, isClockSkewRejection, CLOCK_OBSERVED_KEY } from './clockOffset.js';
import { loadFromSessionStorage } from '@sessionStorage/index.js';

// The production incident (2026-09-14): the machine clock ran 13m23s behind the
// server, so the signature timestamp fell outside the backend's ±5 min window.
const LOCAL_NOW = '2026-09-14T14:10:13Z';
const SERVER_DATE = 'Mon, 14 Sep 2026 14:23:36 GMT';

beforeEach(() => {
  // Only Date is faked — storage and IndexedDB doubles keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(LOCAL_NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('clock offset tracking', () => {
  it('applies no correction before any server date was seen', async () => {
    expect(await getClockOffsetMs()).toBe(0);
  });

  it('learns the server-minus-local offset from a Date header', async () => {
    await noteServerDate(SERVER_DATE);

    expect(await getClockOffsetMs()).toBe(803000);
  });

  it('treats an offset under 30 s as network latency, not skew', async () => {
    await noteServerDate('Mon, 14 Sep 2026 14:10:42 GMT');

    expect(await getClockOffsetMs()).toBe(0);
  });

  it('applies an offset of exactly 30 s', async () => {
    await noteServerDate('Mon, 14 Sep 2026 14:10:43 GMT');

    expect(await getClockOffsetMs()).toBe(30000);
  });

  it('keeps the learned offset when a later Date header is missing or unparseable', async () => {
    await noteServerDate(SERVER_DATE);
    await noteServerDate(null);
    await noteServerDate('not a date');

    expect(await getClockOffsetMs()).toBe(803000);
  });

  it('drops a stale offset once the machine clock is corrected mid-session', async () => {
    await noteServerDate(SERVER_DATE);

    // NTP fixes the clock; the old +13 min correction would now push every
    // timestamp 13 min into the future.
    vi.setSystemTime(new Date('2026-09-14T14:23:40Z'));
    await noteServerDate('Mon, 14 Sep 2026 14:23:40 GMT');

    expect(await getClockOffsetMs()).toBe(0);
  });

  it('reports the observed offset even when storage.session cannot keep it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('storage.session unavailable'));

    // The caller can re-sign with the returned offset right away; only later
    // requests fall back to the raw clock.
    await expect(noteServerDate(SERVER_DATE)).resolves.toBe(803000);
    expect(await getClockOffsetMs()).toBe(0);
  });

  it('reports no offset for a missing or unparseable Date header', async () => {
    await expect(noteServerDate(null)).resolves.toBeNull();
    await expect(noteServerDate('not a date')).resolves.toBeNull();
  });
});

describe('isClockSkewRejection', () => {
  it.each([
    ['the production incident: 13m23s behind the server', '2026-09-14T14:10:13Z', true],
    ['6 min ahead of the server', '2026-09-14T14:29:36Z', true],
    ['exactly 5 min behind the second-truncated Date header (the server may have seen 5m0.9s)', '2026-09-14T14:18:36Z', true],
    ['4m59s behind — still within the Date slack', '2026-09-14T14:18:37Z', true],
    ['4m58s behind — past the slack, inside the window', '2026-09-14T14:18:38Z', false],
    ['4 min behind — inside the window', '2026-09-14T14:19:36Z', false],
    ['in sync', '2026-09-14T14:23:35Z', false]
  ])('signature timestamp %s → %s', (_, signedTimestamp, want) => {
    expect(isClockSkewRejection(signedTimestamp, SERVER_DATE)).toBe(want);
  });

  it('cannot attribute a 401 to skew without both clocks', () => {
    // No timestamp = the request went unsigned; no Date = nothing to compare to.
    expect(isClockSkewRejection(undefined, SERVER_DATE)).toBe(false);
    expect(isClockSkewRejection('2026-09-14T14:10:13Z', null)).toBe(false);
    expect(isClockSkewRejection('2026-09-14T14:10:13Z', 'garbage')).toBe(false);
  });
});

describe('server clock priming (GET /health before the first signature of a session)', () => {
  const HEALTH_URL = 'https://api.example.test/health';
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('with no server date seen this session, asks /health once and applies its Date', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { Date: SERVER_DATE } }));

    expect(await getClockOffsetMs({ prime: true })).toBe(803000);
    expect(await getClockOffsetMs({ prime: true })).toBe(803000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(HEALTH_URL);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
    expect(typeof (await loadFromSessionStorage(CLOCK_OBSERVED_KEY))[CLOCK_OBSERVED_KEY]).toBe('number');
  });

  it('never asks once any response of the session carried a Date', async () => {
    await noteServerDate('Mon, 14 Sep 2026 14:10:14 GMT');

    expect(await getClockOffsetMs({ prime: true })).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('without priming it never touches the network', async () => {
    expect(await getClockOffsetMs()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an unreachable /health leaves the raw clock and is not retried within a minute', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await getClockOffsetMs({ prime: true })).toBe(0);
    expect(await getClockOffsetMs({ prime: true })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-14T14:11:20Z'));
    await getClockOffsetMs({ prime: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a /health answer without a Date header leaves the raw clock', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    expect(await getClockOffsetMs({ prime: true })).toBe(0);
    expect((await loadFromSessionStorage(CLOCK_OBSERVED_KEY))[CLOCK_OBSERVED_KEY]).toBeUndefined();
  });

  it('a non-2xx /health still tells the time', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503, headers: { Date: SERVER_DATE } }));

    expect(await getClockOffsetMs({ prime: true })).toBe(803000);
  });

  it('two signatures racing at session start share one /health and both get the offset', async () => {
    fetchMock.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve(new Response('{}', { status: 200, headers: { Date: SERVER_DATE } })), 20);
    }));

    const [a, b] = await Promise.all([getClockOffsetMs({ prime: true }), getClockOffsetMs({ prime: true })]);

    expect(a).toBe(803000);
    expect(b).toBe(803000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed storage.session read still lets one attempt through, and the offset it observed is used', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(browser.storage.session, 'get').mockRejectedValue(new Error('storage.session unavailable'));
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { Date: SERVER_DATE } }));

    expect(await getClockOffsetMs({ prime: true })).toBe(803000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a backwards clock step (the NTP correction itself) does not suppress a later retry', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await getClockOffsetMs({ prime: true });
    vi.setSystemTime(new Date('2026-09-14T12:10:13Z'));
    await getClockOffsetMs({ prime: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a hanging /health is abandoned after 5 s and the raw clock used', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(LOCAL_NOW));
    fetchMock.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));

    const pending = getClockOffsetMs({ prime: true });
    await vi.advanceTimersByTimeAsync(5000);

    expect(await pending).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
