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
import validateExcludedDomain from './validateExcludedDomain.js';

describe('validateExcludedDomain', () => {
  describe('accepts and normalizes valid input', () => {
    it('returns the bare hostname for a plain domain', () => {
      expect(validateExcludedDomain('example.com')).toEqual({ valid: true, domain: 'example.com' });
    });

    it('strips scheme, www. and trailing slash', () => {
      expect(validateExcludedDomain('https://www.example.com/')).toEqual({ valid: true, domain: 'example.com' });
    });

    it('strips a path, keeping only the hostname', () => {
      expect(validateExcludedDomain('example.com/login?x=1')).toEqual({ valid: true, domain: 'example.com' });
    });

    it('lowercases the hostname (regression: Example.com was wrongly rejected)', () => {
      expect(validateExcludedDomain('Example.COM')).toEqual({ valid: true, domain: 'example.com' });
    });

    it('accepts long/new TLDs (regression: .technology was wrongly rejected)', () => {
      expect(validateExcludedDomain('example.technology')).toEqual({ valid: true, domain: 'example.technology' });
    });

    it('accepts an IP address (has a dot)', () => {
      expect(validateExcludedDomain('192.168.0.1')).toEqual({ valid: true, domain: '192.168.0.1' });
    });

    it('keeps non-www subdomains', () => {
      expect(validateExcludedDomain('sub.example.com')).toEqual({ valid: true, domain: 'sub.example.com' });
    });

    it('trims surrounding whitespace before validating', () => {
      expect(validateExcludedDomain('  example.com  ')).toEqual({ valid: true, domain: 'example.com' });
    });
  });

  describe('rejects invalid input with the right message key', () => {
    it('flags empty / whitespace-only / nullish input as required', () => {
      expect(validateExcludedDomain('')).toMatchObject({ valid: false, messageKey: 'optionsDomainRequired' });
      expect(validateExcludedDomain('   ')).toMatchObject({ valid: false, messageKey: 'optionsDomainRequired' });
      expect(validateExcludedDomain(null)).toMatchObject({ valid: false, messageKey: 'optionsDomainRequired' });
      expect(validateExcludedDomain(undefined)).toMatchObject({ valid: false, messageKey: 'optionsDomainRequired' });
    });

    it('flags input over 256 characters as too long', () => {
      expect(validateExcludedDomain('a'.repeat(257))).toMatchObject({ valid: false, messageKey: 'optionsDomainTooLong' });
    });

    it('flags a bare hostname without a dot as incorrect', () => {
      expect(validateExcludedDomain('localhost')).toMatchObject({ valid: false, messageKey: 'optionsDomainIncorrect' });
    });

    it('flags input that cannot be parsed as a URL as incorrect', () => {
      expect(validateExcludedDomain('not a domain')).toMatchObject({ valid: false, messageKey: 'optionsDomainIncorrect' });
    });

    it('always provides a human-readable fallback message alongside the key', () => {
      expect(validateExcludedDomain('localhost').messageFallback).toBe('Domain is not correct');
      expect(validateExcludedDomain('').messageFallback).toBe('Domain is required');
    });
  });
});
