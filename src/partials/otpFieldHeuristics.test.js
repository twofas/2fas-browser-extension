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
import { isDeniedField, hasOneTimeCode, tokenize } from './otpFieldHeuristics.js';

// Plain stand-in for a field element: only getAttribute is read.
const makeField = (attrs = {}) => ({
  getAttribute: name => (name in attrs ? attrs[name] : null)
});

describe('otpFieldHeuristics/tokenize', () => {
  it('splits camelCase and delimiters into lowercase words', () => {
    expect(tokenize('cardNumber')).toEqual(['card', 'number']);
    expect(tokenize('card-number')).toEqual(['card', 'number']);
    expect(tokenize('card_number')).toEqual(['card', 'number']);
    expect(tokenize('cc-csc')).toEqual(['cc', 'csc']);
  });

  it('returns [] for empty / non-string input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });
});

describe('otpFieldHeuristics/hasOneTimeCode', () => {
  it('detects the one-time-code autocomplete token (case-insensitive)', () => {
    expect(hasOneTimeCode(makeField({ autocomplete: 'one-time-code' }))).toBe(true);
    expect(hasOneTimeCode(makeField({ autocomplete: 'ONE-TIME-CODE' }))).toBe(true);
    expect(hasOneTimeCode(makeField({ autocomplete: 'off' }))).toBe(false);
  });
});

describe('otpFieldHeuristics/isDeniedField — structured attributes', () => {
  it('denies payment-card fields by name/id (whole token, camelCase-aware)', () => {
    expect(isDeniedField(makeField({ name: 'cardNumber' }))).toBe(true);
    expect(isDeniedField(makeField({ id: 'cvv' }))).toBe(true);
    expect(isDeniedField(makeField({ autocomplete: 'cc-csc' }))).toBe(true);
    expect(isDeniedField(makeField({ class: 'postal-code-input' }))).toBe(true);
  });

  it('denies phone / address fields by structured attribute', () => {
    expect(isDeniedField(makeField({ name: 'phone' }))).toBe(true);
    expect(isDeniedField(makeField({ id: 'streetAddress' }))).toBe(true);
    expect(isDeniedField(makeField({ name: 'search' }))).toBe(true);
  });

  it('does NOT deny a plain OTP-looking field', () => {
    expect(isDeniedField(makeField({ name: 'otp', id: 'code' }))).toBe(false);
    expect(isDeniedField(makeField({ name: 'token' }))).toBe(false);
  });
});

describe('otpFieldHeuristics/isDeniedField — free text no longer over-matches (fix)', () => {
  it('does NOT deny a real OTP field whose placeholder mentions "phone" in prose', () => {
    expect(isDeniedField(makeField({ name: 'otp', placeholder: 'Enter the code sent to your phone' }))).toBe(false);
  });

  it('does NOT deny when aria-label mentions "email address"', () => {
    expect(isDeniedField(makeField({ name: 'code', 'aria-label': 'Verification code sent to your email address' }))).toBe(false);
  });

  it('does NOT deny "microphone"/"iphone" substrings (whole-word matching)', () => {
    expect(isDeniedField(makeField({ name: 'iphoneCode' }))).toBe(false);
    expect(isDeniedField(makeField({ id: 'microphoneOtp' }))).toBe(false);
  });

  it('still denies compound tokens across delimiter / camelCase variants (structured only)', () => {
    // user-name / user_name / userName all collapse to "username".
    expect(isDeniedField(makeField({ name: 'user-name' }))).toBe(true);
    expect(isDeniedField(makeField({ name: 'user_name' }))).toBe(true);
    expect(isDeniedField(makeField({ id: 'userName' }))).toBe(true);
    // area-code / areaCode → "areacode".
    expect(isDeniedField(makeField({ name: 'area-code' }))).toBe(true);
    expect(isDeniedField(makeField({ id: 'areaCode' }))).toBe(true);
    // card-number / cardNumber → "cardnumber" (also caught by whole-word "card").
    expect(isDeniedField(makeField({ name: 'card-number' }))).toBe(true);
  });

  it('does NOT deny a compound token appearing only in free-text prose', () => {
    // "username" in a placeholder sentence must not disqualify a real OTP field.
    expect(isDeniedField(makeField({ name: 'otp', placeholder: 'Enter the code for your user-name' }))).toBe(false);
  });

  it('still denies strong tokens even in free text (captcha/cvv in a label)', () => {
    expect(isDeniedField(makeField({ name: 'field', 'aria-label': 'Enter the captcha' }))).toBe(true);
    expect(isDeniedField(makeField({ placeholder: 'CVV' }))).toBe(true);
  });
});

describe('otpFieldHeuristics/isDeniedField — one-time-code hard accept', () => {
  it('never denies a one-time-code field, even with a deny token present', () => {
    expect(isDeniedField(makeField({ autocomplete: 'one-time-code', name: 'phone' }))).toBe(false);
  });

  it('returns false for a null / attribute-less element', () => {
    expect(isDeniedField(null)).toBe(false);
    expect(isDeniedField({})).toBe(false);
  });
});
