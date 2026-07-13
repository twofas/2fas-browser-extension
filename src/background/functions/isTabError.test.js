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

import { describe, it, expect } from 'vitest';
import isTabError from './isTabError.js';

describe('isTabError', () => {
  it('is true for a "No tab with id" error', () => {
    expect(isTabError(new Error('No tab with id: 42'))).toBe(true);
  });

  it('is true for an "Invalid tab ID" error', () => {
    expect(isTabError(new Error('Invalid tab ID: 42'))).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isTabError(new Error('Something else went wrong'))).toBe(false);
  });

  it('is false for an error with no message', () => {
    expect(isTabError({})).toBe(false);
  });

  it('is false for null/undefined', () => {
    expect(isTabError(null)).toBe(false);
    expect(isTabError(undefined)).toBe(false);
  });
});
