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

/**
 * Deny-list of substring tokens that mark a field as NOT a standard TOTP target.
 * Mirrors the negative heuristics used by open-source password managers
 * (KeePassXC ignoreRegex, Bitwarden RecoveryCode/CVC exclusions). Intentionally
 * excludes ambiguous-but-valid OTP words like "verification" — those are
 * disambiguated by the card/cvc tokens instead (e.g. "card-verification-code").
 * @type {string[]}
 */
const OTP_DENY_TOKENS = [
  'cvc', 'cvv', 'cvv2', 'csc', 'cvn',
  'card', 'cardnumber', 'card-number',
  'postal', 'zip', 'zipcode', 'zip-code',
  'coupon', 'promo', 'discount', 'voucher',
  'recovery', 'backup',
  'captcha',
  'area-code', 'areacode',
  'search', 'query',
  'username', 'user-name', 'user_name',
  'password', 'newsletter',
  'phone', 'telephone', 'mobile',
  'address', 'street'
];

/**
 * Reads the attributes used for OTP heuristics into a single lowercase string.
 * @param {Element} el - Element to read
 * @returns {string} Concatenated lowercase attribute text
 */
const fieldText = el => {
  if (!el || typeof el.getAttribute !== 'function') {
    return '';
  }

  return ['id', 'name', 'placeholder', 'aria-label', 'autocomplete', 'class']
    .map(attr => el.getAttribute(attr))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

/**
 * Checks whether an element carries the spec-blessed OTP autofill token.
 * This is the single highest-confidence positive signal (HTML spec, Safari,
 * WebOTP and every password manager agree) and overrides the deny-list.
 * @param {Element} el - Element to check
 * @returns {boolean} True if autocomplete contains "one-time-code"
 */
const hasOneTimeCode = el => {
  const autocomplete = (el?.getAttribute?.('autocomplete') || '').toLowerCase();
  return autocomplete.includes('one-time-code');
};

/**
 * Decides whether a field should be excluded from OTP targeting/numbering.
 * `autocomplete="one-time-code"` is a hard accept that bypasses the deny-list.
 * @param {Element} el - Element to check
 * @returns {boolean} True if the field matches a deny token and is not one-time-code
 */
const isDeniedField = el => {
  if (!el) {
    return false;
  }

  if (hasOneTimeCode(el)) {
    return false;
  }

  const text = fieldText(el);

  if (!text) {
    return false;
  }

  return OTP_DENY_TOKENS.some(token => text.includes(token));
};

export { OTP_DENY_TOKENS, hasOneTimeCode, isDeniedField };
export default isDeniedField;
