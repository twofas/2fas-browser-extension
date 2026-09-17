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

const resetExtensionStorage = vi.fn().mockResolvedValue(undefined);
vi.mock('./resetExtensionStorage.js', () => ({ default: (...a) => resetExtensionStorage(...a) }));
vi.mock('./storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../notification/index.js', () => ({ default: { show: vi.fn().mockResolvedValue(undefined) } }));

import showIntegrityError from './showIntegrityError.js';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = `
    <div class="twofas-install-page-integrity-error js-twofas-integrity-error">
      <h1>Browser Extension data error</h1>
      <button class="btn js-twofas-integrity-reset">Reset Browser Extension</button>
    </div>`;
});

describe('showIntegrityError', () => {
  it('reveals the overlay and resets the extension from its button after confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    showIntegrityError();
    document.querySelector('.js-twofas-integrity-reset').click();

    expect(document.querySelector('.js-twofas-integrity-error').classList.contains('show-integrity-error')).toBe(true);
    expect(resetExtensionStorage).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the confirmation is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    showIntegrityError();
    document.querySelector('.js-twofas-integrity-reset').click();

    expect(resetExtensionStorage).not.toHaveBeenCalled();
  });

  it('binds the button once even when the overlay is shown repeatedly', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    showIntegrityError();
    showIntegrityError();
    document.querySelector('.js-twofas-integrity-reset').click();

    expect(resetExtensionStorage).toHaveBeenCalledTimes(1);
  });
});

describe('showIntegrityError — without the overlay markup', () => {
  it('is a no-op instead of throwing (shared by both pages; a missing element must not break recovery)', () => {
    document.body.innerHTML = '';

    expect(() => showIntegrityError()).not.toThrow();
  });
});

describe('showIntegrityError — signing states use their own texts', () => {
  const markup = () => {
    document.body.innerHTML = `
      <div class="js-twofas-integrity-error">
        <h1>Browser Extension data error</h1>
        <h2>Please use Reset Browser Extension below</h2>
        <button class="btn js-twofas-integrity-reset">Reset Browser Extension</button>
      </div>`;
  };

  it('replaces the title and the message with the given texts', () => {
    markup();

    showIntegrityError({ Title: 'Re-pairing required', Message: 'Use Reset Browser Extension below and pair again.' });

    expect(document.querySelector('.js-twofas-integrity-error h1').textContent).toBe('Re-pairing required');
    expect(document.querySelector('.js-twofas-integrity-error h2').textContent).toBe('Use Reset Browser Extension below and pair again.');
    expect(document.querySelector('.js-twofas-integrity-error').classList.contains('show-integrity-error')).toBe(true);
  });

  it('keeps the generic texts when called without texts', () => {
    markup();

    showIntegrityError();

    expect(document.querySelector('.js-twofas-integrity-error h1').textContent).toBe('Browser Extension data error');
    expect(document.querySelector('.js-twofas-integrity-error h2').textContent).toBe('Please use Reset Browser Extension below');
  });
});
