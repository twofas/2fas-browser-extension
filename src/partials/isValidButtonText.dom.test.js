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

import { describe, it, expect } from 'vitest';
import { isValidButtonText } from './isValidButtonText.js';

// Real elements exercise the IDL `.type` semantics the object stand-ins cannot:
// a <button> with no type attribute defaults to type="submit".
describe('isValidButtonText — IDL .type on real elements', () => {
  it('keeps an icon-only <button> with NO type attribute (defaults to submit)', () => {
    const button = document.createElement('button');
    // No text, no type attribute → getAttribute('type') is null but .type is 'submit'.
    expect(button.getAttribute('type')).toBeNull();
    expect(button.type).toBe('submit');
    expect(isValidButtonText(button)).toBe(true);
  });

  it('rejects an icon-only <button type="button"> (explicit non-submit)', () => {
    const button = document.createElement('button');
    button.type = 'button';
    expect(isValidButtonText(button)).toBe(false);
  });

  it('keeps a value-less <input type="submit"> (UA-default label)', () => {
    const input = document.createElement('input');
    input.type = 'submit';
    expect(isValidButtonText(input)).toBe(true);
  });

  it('rejects a bare <input> (defaults to type="text", not submit)', () => {
    const input = document.createElement('input');
    expect(input.type).toBe('text');
    expect(isValidButtonText(input)).toBe(false);
  });
});
