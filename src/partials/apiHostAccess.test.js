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

import { describe, it, expect, vi, afterEach } from 'vitest';
import browser from 'webextension-polyfill';
import * as signingHeaderNames from '@background/functions/signing/signingHeaderNames.js';
import { API_HOST_PATTERN, hasApiHostAccess, isApiBlockedByBrowser } from './apiHostAccess.js';

// The SDK's normalized shape of a fetch that never produced a response
// (Safari: "Load failed", Chrome: "Failed to fetch") — also what a CORS block looks like.
const loadFailed = () => ({ name: 'TypeError', message: 'Load failed' });

// Two probes: the plain GET /health (no custom headers, never preflighted) and the
// same GET carrying the SDK's request headers (preflighted under CORS). A CORS
// block answers the first and kills the second before it reaches the server.
const stubProbes = ({ plain, preflighted }) => {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const outcome = init.headers ? preflighted : plain;

    if (outcome instanceof Error) {
      throw outcome;
    }

    return outcome;
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

const ok = () => new Response('{}', { status: 200 });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('API_HOST_PATTERN', () => {
  it('covers every path of the configured API origin', () => {
    expect(API_HOST_PATTERN).toBe('https://api.example.test/*');
  });
});

describe('hasApiHostAccess', () => {
  it('asks the browser about the API origin and reports a missing grant', async () => {
    const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);

    expect(await hasApiHostAccess()).toBe(false);
    expect(contains).toHaveBeenCalledWith({ origins: [API_HOST_PATTERN] });
  });

  it('reports a granted host', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true);

    expect(await hasApiHostAccess()).toBe(true);
  });

  it('returns null when the browser cannot answer', async () => {
    vi.spyOn(browser.permissions, 'contains').mockRejectedValue(new Error('unsupported'));

    expect(await hasApiHostAccess()).toBe(null);
  });
});

describe('isApiBlockedByBrowser', () => {
  it('is true when the API answers a plain request but a request with our headers dies in the browser', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(true);
    expect(probes).toHaveBeenCalledTimes(2);
    expect(probes.mock.calls.every(([url]) => url === 'https://api.example.test/health')).toBe(true);
  });

  it('is false when a request with our headers gets through too: a network glitch, not a block', async () => {
    // Installs without host access stay on the CORS path for good. A lost request
    // followed by a healthy probe must not tell them the browser blocks 2FAS.
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    stubProbes({ plain: ok(), preflighted: ok() });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(false);
  });

  it('sends the plain probe without headers and the second one with the SDK request headers', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    await isApiBlockedByBrowser(loadFailed());

    const [plainInit, preflightedInit] = probes.mock.calls.map(([, init]) => init);
    const sent = Object.keys(preflightedInit.headers).map(name => name.toLowerCase()).sort();
    const expected = ['Content-Type', ...Object.values(signingHeaderNames)].map(name => name.toLowerCase()).sort();

    expect(plainInit.headers).toBeUndefined();
    expect(sent).toEqual(expected);
    expect(preflightedInit.headers['Content-Type']).toBe('application/json');
  });

  it('is false when the second probe only timed out', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    stubProbes({ plain: ok(), preflighted: new DOMException('The operation was aborted.', 'AbortError') });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(false);
  });

  it('is false when host access is granted: the browser applies no CORS, so it cannot be the cause', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true);
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(false);
    expect(probes).not.toHaveBeenCalled();
  });

  it('is false when the browser cannot tell whether host access is granted', async () => {
    vi.spyOn(browser.permissions, 'contains').mockRejectedValue(new Error('unsupported'));
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(false);
    expect(probes).not.toHaveBeenCalled();
  });

  it('is false when the API does not answer a plain request either (offline, outage)', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    stubProbes({ plain: new TypeError('Load failed'), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(false);
  });

  it('runs both probes at once, so a hanging API costs one probe timeout, not two', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    let started = 0;
    const releases = [];

    vi.stubGlobal('fetch', vi.fn(() => {
      started += 1;

      return new Promise((resolve, reject) => releases.push(() => reject(new TypeError('Load failed'))));
    }));

    const pending = isApiBlockedByBrowser(loadFailed());

    await vi.waitFor(() => expect(started).toBe(2));
    releases.forEach(release => release());

    expect(await pending).toBe(false);
  });

  it('is false when the plain probe gets a server error', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    stubProbes({ plain: new Response('', { status: 503 }), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser(loadFailed())).toBe(false);
  });

  it.each([401, 407, 408, 429, 503])('is false for HTTP %i: the request reached a server', async status => {
    const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser({ status, statusText: 'x' })).toBe(false);
    expect(contains).not.toHaveBeenCalled();
    expect(probes).not.toHaveBeenCalled();
  });

  it('is false for the SDK timeout: a slow server, not a blocked request', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser({ name: 'AbortError', message: 'The operation was aborted.' })).toBe(false);
    expect(probes).not.toHaveBeenCalled();
  });

  it('is false for an error of our own code', async () => {
    vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
    const probes = stubProbes({ plain: ok(), preflighted: new TypeError('Load failed') });

    expect(await isApiBlockedByBrowser(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(probes).not.toHaveBeenCalled();
  });

  it('is false for no error at all', async () => {
    expect(await isApiBlockedByBrowser(undefined)).toBe(false);
  });
});
