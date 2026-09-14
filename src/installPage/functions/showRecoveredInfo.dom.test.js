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

import { describe, it, expect, beforeEach } from 'vitest';
import showRecoveredInfo from './showRecoveredInfo.js';
import configurationComplete from './configurationComplete.js';

const render = () => {
  document.body.innerHTML = `
    <div class="twofas-install-page-recovered js-twofas-recovered-info hidden"></div>
    <div class="twofas-install-page-new-device"></div>
    <div class="twofas-install-page-configured hidden"></div>
  `;
};

const banner = () => document.querySelector('.js-twofas-recovered-info');

describe('showRecoveredInfo', () => {
  beforeEach(render);

  it('stays hidden on a regular install-page open', () => {
    window.history.replaceState({}, '', '/installPage/installPage.html');

    showRecoveredInfo();

    expect(banner().classList.contains('hidden')).toBe(true);
  });

  it('stays hidden for an unknown reason', () => {
    window.history.replaceState({}, '', '/installPage/installPage.html?reason=other');

    showRecoveredInfo();

    expect(banner().classList.contains('hidden')).toBe(true);
  });

  it('reveals the banner when opened by the self-heal (?reason=recovered)', () => {
    window.history.replaceState({}, '', '/installPage/installPage.html?reason=recovered');

    showRecoveredInfo();

    expect(banner().classList.contains('hidden')).toBe(false);
  });

  it('consumes the reason so a reload does not re-announce the loss', () => {
    window.history.replaceState({}, '', '/installPage/installPage.html?reason=recovered');

    showRecoveredInfo();

    expect(banner().classList.contains('hidden')).toBe(false);
    // The install page is also the "add another device" page, and
    // resetExtensionStorage reloads it — neither may bring the banner back.
    expect(window.location.search).toBe('');

    render();
    showRecoveredInfo();
    expect(banner().classList.contains('hidden')).toBe(true);
  });

  it('is hidden again once pairing completes (configurationComplete)', () => {
    window.history.replaceState({}, '', '/installPage/installPage.html?reason=recovered');
    showRecoveredInfo();

    configurationComplete();

    expect(banner().classList.contains('hidden')).toBe(true);
    expect(document.querySelector('.twofas-install-page-configured').classList.contains('hidden')).toBe(false);
  });
});
