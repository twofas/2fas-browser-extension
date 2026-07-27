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

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import formSubmitSelectors from './formSubmitSelectors.js';

describe('formSubmitSelectors', () => {
  const selector = formSubmitSelectors();

  it('targets submit buttons and submit inputs', () => {
    expect(typeof selector).toBe('string');
    expect(selector).toContain('button[type="submit"]');
    expect(selector).toContain('input[type="submit"]');
  });

  describe('against a live DOM (jsdom)', () => {
    const matches = html => {
      const host = document.createElement('div');
      host.innerHTML = html;

      return host.firstElementChild.matches(selector);
    };

    it('is a syntactically valid selector (querySelector does not throw)', () => {
      expect(() => document.querySelector(selector)).not.toThrow();
    });

    it('matches genuine submit controls', () => {
      expect(matches('<button type="submit">Log in</button>')).toBe(true);
      expect(matches('<input type="submit" value="Send">')).toBe(true);
    });

    it('ignores non-submit buttons', () => {
      expect(matches('<button type="button">Open menu</button>')).toBe(false);
    });

    it('ignores disabled, cancel and extension-owned submit buttons', () => {
      expect(matches('<button type="submit" disabled>Go</button>')).toBe(false);
      expect(matches('<button type="submit" class="btn cancel">Cancel</button>')).toBe(false);
      expect(matches('<button type="submit" class="twofas-icon">x</button>')).toBe(false);
    });
  });
});
