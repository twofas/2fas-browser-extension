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
import isDigitInput from './isDigitInput.js';

const el = type => ({ getAttribute: name => (name === 'type' ? type : null) });

describe('isDigitInput', () => {
  it('accepts text / tel / number', () => {
    expect(isDigitInput(el('text'))).toBe(true);
    expect(isDigitInput(el('tel'))).toBe(true);
    expect(isDigitInput(el('number'))).toBe(true);
  });

  it('defaults a typeless input to text (accepted)', () => {
    expect(isDigitInput(el(null))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isDigitInput(el('TEL'))).toBe(true);
  });

  it('rejects password by default (fallback auto-type path)', () => {
    expect(isDigitInput(el('password'))).toBe(false);
  });

  it('accepts password when allowPassword is set (segmented-group detection)', () => {
    expect(isDigitInput(el('password'), { allowPassword: true })).toBe(true);
  });

  it('rejects non-digit types regardless of allowPassword', () => {
    expect(isDigitInput(el('email'))).toBe(false);
    expect(isDigitInput(el('checkbox'), { allowPassword: true })).toBe(false);
  });
});
