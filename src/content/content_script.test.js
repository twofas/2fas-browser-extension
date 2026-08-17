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

import { describe, it, expect, vi } from 'vitest';
import browser from 'webextension-polyfill';

const mocks = vi.hoisted(() => ({
  getTabData: vi.fn(() => Promise.resolve({ id: 1, url: 'https://x.test' })),
  isInFrame: vi.fn(() => false)
}));
vi.mock('@content/functions', () => mocks);
vi.mock('@content/events/contentOnMessage.js', () => ({ default: vi.fn() }));

const LISTENER_KEY = '__2fasMessageListener';

describe('content_script — onMessage listener lifecycle', () => {
  it('stays attached through cancelled navigations and survives bfcache via pagehide/pageshow', async () => {
    browser.runtime.id = 'ext-id';
    browser.runtime.onMessage = { addListener: vi.fn(), removeListener: vi.fn() };
    const { addListener, removeListener } = browser.runtime.onMessage;

    await import('./content_script.js');

    // Initial load registers exactly once.
    expect(addListener).toHaveBeenCalledTimes(1);
    const listener = addListener.mock.calls[0][0];
    expect(window[LISTENER_KEY]).toBe(listener);

    // The load-time pageshow is a no-op while the listener is attached.
    window.dispatchEvent(new Event('pageshow'));
    expect(addListener).toHaveBeenCalledTimes(1);

    // Cancelled navigation / download link: beforeunload fires, pagehide never
    // does, and no pageshow follows — the listener must stay attached or the
    // tab goes permanently deaf to token delivery (log 58).
    window.dispatchEvent(new Event('beforeunload'));
    expect(removeListener).not.toHaveBeenCalled();
    expect(window[LISTENER_KEY]).toBe(listener);

    // Entering the back/forward cache (or a real unload) detaches.
    window.dispatchEvent(new Event('pagehide'));
    expect(removeListener).toHaveBeenCalledWith(listener);
    expect(window[LISTENER_KEY]).toBeNull();

    // bfcache restore re-attaches the same listener — content scripts are not
    // re-executed on restore, pageshow is the only signal.
    window.dispatchEvent(new Event('pageshow'));
    expect(addListener).toHaveBeenCalledTimes(2);
    expect(addListener).toHaveBeenLastCalledWith(listener);
    expect(window[LISTENER_KEY]).toBe(listener);

    // The cycle is repeatable — pagehide is not a one-shot handler.
    window.dispatchEvent(new Event('pagehide'));
    expect(window[LISTENER_KEY]).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
    expect(addListener).toHaveBeenCalledTimes(3);
    expect(window[LISTENER_KEY]).toBe(listener);
  });

  it('a second injection replaces the previous listener AND its lifecycle handlers', async () => {
    const staleListener = window[LISTENER_KEY];
    // resetModules also resets the webextension-polyfill stub, so the re-imported
    // content script sees a fresh browser instance — set the spies up on that one.
    vi.resetModules();
    const { default: freshBrowser } = await import('webextension-polyfill');
    freshBrowser.runtime.id = 'ext-id';
    freshBrowser.runtime.onMessage = { addListener: vi.fn(), removeListener: vi.fn() };
    const { addListener, removeListener } = freshBrowser.runtime.onMessage;

    await import('./content_script.js');

    // The stale listener is replaced by the fresh one.
    expect(removeListener).toHaveBeenCalledWith(staleListener);
    expect(addListener).toHaveBeenCalledTimes(1);
    const freshListener = addListener.mock.calls[0][0];
    expect(freshListener).not.toBe(staleListener);
    expect(window[LISTENER_KEY]).toBe(freshListener);

    // Only the fresh injection's lifecycle handlers may run — a stale pageshow
    // handler would otherwise resurrect the stale listener after a bfcache cycle.
    window.dispatchEvent(new Event('pagehide'));
    expect(window[LISTENER_KEY]).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
    expect(addListener).toHaveBeenCalledTimes(2);
    expect(addListener).toHaveBeenLastCalledWith(freshListener);
    expect(window[LISTENER_KEY]).toBe(freshListener);
  });
});
