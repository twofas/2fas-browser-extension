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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom has no layout, so the real isVisible would hide everything.
vi.mock('@partials/isVisible.js', () => ({ default: () => true }));

import findFallbackOtpInput from './findFallbackOtpInput.js';

const addInput = attrs => {
  const input = document.createElement('input');
  Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
  document.body.appendChild(input);
  return input;
};

beforeEach(() => {
  document.body.replaceChildren();
});

describe('findFallbackOtpInput — one-time-code tier', () => {
  it('returns the sole one-time-code field', () => {
    const otp = addInput({ autocomplete: 'one-time-code' });
    expect(findFallbackOtpInput()).toBe(otp);
  });

  it('returns null for multiple one-time-code fields that are not one segmented group', () => {
    addInput({ autocomplete: 'one-time-code' });
    addInput({ autocomplete: 'one-time-code' });
    // Two standalone one-time-code inputs (not maxlength=1 boxes) → ambiguous.
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('does not fall through to heuristics when one-time-code fields are ambiguous', () => {
    addInput({ autocomplete: 'one-time-code' });
    addInput({ autocomplete: 'one-time-code' });
    addInput({ name: 'otp' }); // a lone heuristic match exists, but must be ignored
    expect(findFallbackOtpInput()).toBeNull();
  });
});

describe('findFallbackOtpInput — broadened heuristic tier (T1)', () => {
  it('returns a single confident heuristic match when there is no one-time-code field', () => {
    const otp = addInput({ name: 'otp', type: 'text' });
    expect(findFallbackOtpInput()).toBe(otp);
  });

  it('returns null when multiple unrelated heuristic matches exist (no guessing)', () => {
    addInput({ name: 'otp' });
    addInput({ id: 'verificationCode' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('ignores a denied field (e.g. CVV) so a lone real match still wins', () => {
    const otp = addInput({ name: 'otp' });
    addInput({ name: 'cvv' }); // denied → not counted
    expect(findFallbackOtpInput()).toBe(otp);
  });

  it('does not target a password-typed field even if it matches OTP heuristics', () => {
    addInput({ name: 'otp', type: 'password' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null when there is no candidate at all', () => {
    addInput({ name: 'firstName', type: 'text' });
    expect(findFallbackOtpInput()).toBeNull();
  });
});

describe('findFallbackOtpInput — must NOT target an unrelated field (T1 overriding constraint)', () => {
  it('returns null for a bare <input type="text"> with no OTP signal', () => {
    addInput({ type: 'text' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null for a bare <input> with no type/attributes', () => {
    document.body.appendChild(document.createElement('input'));
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null for a lone phone field (placeholder prose is not an OTP signal)', () => {
    addInput({ type: 'tel', placeholder: 'Phone number' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null for a lone username field (name="user-name")', () => {
    addInput({ type: 'text', name: 'user-name' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('DOES target a lone field that carries a real OTP signal (placeholder keyword)', () => {
    const otp = addInput({ type: 'text', placeholder: 'Enter verification code' });
    expect(findFallbackOtpInput()).toBe(otp);
  });

  it('DOES target a lone field with an OTP id', () => {
    const otp = addInput({ type: 'text', id: 'verificationCode' });
    expect(findFallbackOtpInput()).toBe(otp);
  });
});

describe('findFallbackOtpInput — location/phone "code" placeholders are not OTP targets (F6)', () => {
  it('returns null for a lone "Area code" field (placeholder matches only via the word "code")', () => {
    addInput({ type: 'tel', placeholder: 'Area code' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null for a lone "Zip code" field', () => {
    addInput({ type: 'text', placeholder: 'Zip code' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null for a lone "Postal code" field (aria-label)', () => {
    addInput({ type: 'text', 'aria-label': 'Postal code' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('returns null for a lone "Country code" field', () => {
    addInput({ type: 'tel', placeholder: 'Country code' });
    expect(findFallbackOtpInput()).toBeNull();
  });

  it('STILL targets a genuine OTP field whose placeholder is "verification code" (no false exclusion)', () => {
    const otp = addInput({ type: 'text', placeholder: 'Enter your verification code' });
    expect(findFallbackOtpInput()).toBe(otp);
  });

  it('STILL targets an OTP field whose label says the code was sent to a phone', () => {
    const otp = addInput({ type: 'text', name: 'otp', placeholder: 'Enter the code sent to your phone' });
    expect(findFallbackOtpInput()).toBe(otp);
  });
});
