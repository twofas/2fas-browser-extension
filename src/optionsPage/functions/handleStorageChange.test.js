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

const generateDomainsList = vi.fn();
vi.mock('@optionsPage/functions/generateDomainsList.js', () => ({ default: (...args) => generateDomainsList(...args) }));

import handleStorageChange from './handleStorageChange.js';

beforeEach(() => {
  generateDomainsList.mockReset();
});

describe('handleStorageChange', () => {
  it('re-renders the domains list when autoSubmitExcludedDomains changes in local storage', () => {
    handleStorageChange({ autoSubmitExcludedDomains: { oldValue: [], newValue: ['x.com'] } }, 'local');

    expect(generateDomainsList).toHaveBeenCalledWith(['x.com']);
  });

  it('ignores changes in a non-local storage area', () => {
    handleStorageChange({ autoSubmitExcludedDomains: { newValue: ['x.com'] } }, 'session');

    expect(generateDomainsList).not.toHaveBeenCalled();
  });

  it('ignores local changes that do not touch the excluded-domains list', () => {
    handleStorageChange({ devices: { newValue: [{ device_id: 'd1' }] } }, 'local');

    expect(generateDomainsList).not.toHaveBeenCalled();
  });
});
