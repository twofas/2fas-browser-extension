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

const submitsRef = { current: [] };
vi.mock('@content/functions/getFormSubmitElements.js', () => ({ default: () => submitsRef.current }));
vi.mock('@localStorage/loadFromLocalStorage.js', () => ({
  default: async () => ({ autoSubmitEnabled: true, autoSubmitExcludedDomains: [] })
}));
vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import clickSubmit from './clickSubmit.js';

beforeEach(() => {
  document.body.replaceChildren();
  submitsRef.current = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('clickSubmit — button-readiness poll (T9)', () => {
  it('waits for a disabled submit button to become enabled, then clicks it', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const button = document.createElement('button');
    button.type = 'submit';
    button.disabled = true;
    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);
    document.body.appendChild(button);
    submitsRef.current = [button];

    vi.useFakeTimers();
    const pending = clickSubmit(input, 'https://example.test');

    await vi.advanceTimersByTimeAsync(150);
    expect(clickSpy).not.toHaveBeenCalled(); // still disabled → not clicked yet

    button.disabled = false;
    await vi.advanceTimersByTimeAsync(100);

    await pending;
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('clicks an already-enabled button promptly (no fixed pre-delay)', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const button = document.createElement('button');
    button.type = 'submit';
    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);
    document.body.appendChild(button);
    submitsRef.current = [button];

    const result = await clickSubmit(input, 'https://example.test');

    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves false (and does not click) when the button stays disabled past the budget (F4)', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const button = document.createElement('button');
    button.type = 'submit';
    button.disabled = true;
    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);
    document.body.appendChild(button);
    submitsRef.current = [button];

    vi.useFakeTimers();
    const pending = clickSubmit(input, 'https://example.test');
    await vi.advanceTimersByTimeAsync(1000);

    // A click on a still-disabled button is a no-op, so clickSubmit must report false,
    // not claim a submit that never happened.
    await expect(pending).resolves.toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('resolves false (and does not click) when the target is detached while waiting (F4)', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const button = document.createElement('button');
    button.type = 'submit';
    button.disabled = true;
    const clickSpy = vi.fn();
    button.addEventListener('click', clickSpy);
    document.body.appendChild(button);
    submitsRef.current = [button];

    vi.useFakeTimers();
    const pending = clickSubmit(input, 'https://example.test');

    // Detach the button mid-wait: even if it "enables", it is no longer in the document.
    await vi.advanceTimersByTimeAsync(100);
    button.disabled = false;
    button.remove();
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
