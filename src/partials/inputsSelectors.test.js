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
import inputsSelectors from './inputsSelectors.js';

describe('inputsSelectors', () => {
  const selector = inputsSelectors();

  it('returns a non-empty comma-separated selector string', () => {
    expect(typeof selector).toBe('string');
    expect(selector.length).toBeGreaterThan(0);
    expect(selector).toContain(',');
  });

  it('targets the one-time-code autocomplete attribute', () => {
    expect(selector).toContain('input[autocomplete="one-time-code" i]');
  });

  it('matches OTP-related name and id attributes case-insensitively', () => {
    expect(selector).toContain('input[name="otp" i]');
    expect(selector).toContain('input[id="otp" i]');
    expect(selector).toContain('input[name="verification_code" i]');
  });

  it('matches OTP keywords in placeholder and aria-label (partial)', () => {
    expect(selector).toContain('input[placeholder*="code" i]');
    expect(selector).toContain('input[aria-label*="code" i]');
  });

  it('excludes username and password fields', () => {
    expect(selector).toContain(':not([id="username" i])');
    expect(selector).toContain(':not([name="username" i])');
    expect(selector).toContain(':not([id="password" i])');
    expect(selector).toContain(':not([name="password" i])');
  });

  it('excludes search inputs by type and role', () => {
    expect(selector).toContain(':not([type="search" i])');
    expect(selector).toContain(':not([role="searchbox" i])');
  });

  it('is memoized: repeated calls return the identical cached string', () => {
    expect(inputsSelectors()).toBe(selector);
  });

  describe('against a live DOM (jsdom)', () => {
    // Resolves the generated selector against a freshly-parsed element. Because
    // Element.matches() throws on a malformed selector, every positive/negative
    // case below also doubles as a selector-syntax regression guard.
    const matches = html => {
      const host = document.createElement('div');
      host.innerHTML = html;

      return host.firstElementChild.matches(selector);
    };

    it('is a syntactically valid selector (querySelector does not throw)', () => {
      expect(() => document.querySelector(selector)).not.toThrow();
    });

    it('matches OTP/2FA inputs', () => {
      expect(matches('<input name="otp">')).toBe(true);
      expect(matches('<input id="2fa-code">')).toBe(true);
      expect(matches('<input autocomplete="one-time-code">')).toBe(true);
      expect(matches('<input placeholder="Enter your verification code">')).toBe(true);
      expect(matches('<input aria-label="Authentication code">')).toBe(true);
    });

    it('does not match username, password, email or search inputs', () => {
      expect(matches('<input name="username">')).toBe(false);
      expect(matches('<input type="password" name="password">')).toBe(false);
      expect(matches('<input name="email">')).toBe(false);
      expect(matches('<input type="search">')).toBe(false);
    });
  });
});
