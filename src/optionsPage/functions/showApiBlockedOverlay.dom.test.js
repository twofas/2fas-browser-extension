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
import showApiBlockedOverlay from './showApiBlockedOverlay.js';

const OVERLAY = '.js-twofas-api-blocked';

beforeEach(() => {
  document.body.innerHTML = `
    <div class="twofas-options-page-integrity-error js-twofas-api-blocked">
      <h1>Browser is blocking 2FAS</h1>
      <h2 class="js-twofas-api-blocked-message">Your browser does not let this extension connect to the 2FAS server.</h2>
      <ol class="js-twofas-api-blocked-steps"></ol>
      <button class="btn btn-theme js-twofas-api-blocked-refresh">Refresh</button>
    </div>`;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const steps = () => [...document.querySelectorAll('.js-twofas-api-blocked-steps li')].map(li => li.textContent);

// The site as the browser may list it: the bare domain, not only api2.2fas.com.
const namesBareDomain = text => /(^|[^.\w])2fas\.com/.test(text);

describe('showApiBlockedOverlay', () => {
  it('covers the page', () => {
    showApiBlockedOverlay();

    expect(document.querySelector(OVERLAY).classList.contains('show-integrity-error')).toBe(true);
  });

  it('walks a Safari user to Edit Websites, where the access is changed', () => {
    vi.stubEnv('EXT_PLATFORM', 'Safari');

    showApiBlockedOverlay();

    expect(steps().length).toBe(3);
    expect(steps().some(step => step.includes('Edit Websites'))).toBe(true);
    expect(steps().some(namesBareDomain)).toBe(true);
    expect(steps().some(step => step.includes('api2.2fas.com'))).toBe(true);
  });

  it('points other browsers at the extension settings of the browser', () => {
    vi.stubEnv('EXT_PLATFORM', 'Chrome');

    showApiBlockedOverlay();

    expect(steps().length > 0).toBe(true);
    expect(steps().some(step => step.includes('Edit Websites'))).toBe(false);
    expect(steps().some(namesBareDomain)).toBe(true);
  });

  it('has no Reset: a new identity would be blocked the same way', () => {
    showApiBlockedOverlay();

    expect(document.querySelector(`${OVERLAY} .js-twofas-integrity-reset`)).toBe(null);
  });

  it('reloads the page from Refresh, once the user changed the setting', () => {
    const reload = vi.fn();

    showApiBlockedOverlay({ reload });
    document.querySelector('.js-twofas-api-blocked-refresh').click();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('binds Refresh once even when shown again', () => {
    const reload = vi.fn();

    showApiBlockedOverlay({ reload });
    showApiBlockedOverlay({ reload });
    document.querySelector('.js-twofas-api-blocked-refresh').click();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(steps().length > 0).toBe(true);
    expect(new Set(steps()).size).toBe(steps().length);
  });
});
