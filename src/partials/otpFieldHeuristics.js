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

// Deny tokens are matched as WHOLE words (after splitting attribute values on
// delimiters and camelCase), never as raw substrings. Substring matching wrongly
// disqualified real OTP fields — e.g. "phone"/"address" appearing inside a
// descriptive placeholder/aria-label ("code sent to your phone"), or inside an
// unrelated word ("iphone", "microphone").

/**
 * Strong deny tokens: unambiguous non-OTP markers (payment card codes, coupons,
 * captchas, recovery/backup codes). They essentially never occur in a genuine
 * OTP field's description, so they are matched against EVERY attribute — including
 * the free-text placeholder / aria-label.
 * @type {string[]}
 */
const STRONG_DENY_TOKENS = [
  'cvc', 'cvv', 'cvv2', 'csc', 'cvn',
  'coupon', 'promo', 'discount', 'voucher',
  'captcha',
  'recovery', 'backup'
];

/**
 * Weak deny tokens (single words): appear legitimately in OTP prose ("code sent to
 * your phone", "email address"), so they are matched ONLY as WHOLE words against the
 * structured attributes (id, name, autocomplete, class), never the free-text
 * placeholder / aria-label. A descriptive label no longer disqualifies a real OTP
 * field, while a `name="phone"` field is still excluded. Whole-word matching also
 * avoids "iphone"/"microphone" false positives on "phone".
 * @type {string[]}
 */
const WEAK_DENY_TOKENS = [
  'card',
  'postal', 'zip',
  'password', 'newsletter',
  'phone', 'telephone', 'mobile',
  'address', 'street',
  'search', 'query'
];

/**
 * Weak COMPOUND deny tokens: multi-word markers whose base word is too broad to
 * deny on its own (`user`, `area`). Because attribute values delimit or camelCase
 * these (`user-name`, `user_name`, `userName`, `area-code`), whole-word tokenization
 * would split them and miss the compound, so they are matched as substrings against
 * the DELIMITER-STRIPPED structured text only (still no free text, so no prose false
 * positives). `microphone`/`iphone` are unaffected — none of these are "phone".
 * @type {string[]}
 */
const WEAK_COMPOUND_TOKENS = [
  'username',
  'areacode',
  'cardnumber',
  'postalcode',
  'zipcode'
];

/** Combined deny tokens (kept for reference/compat). @type {string[]} */
const OTP_DENY_TOKENS = [...STRONG_DENY_TOKENS, ...WEAK_DENY_TOKENS, ...WEAK_COMPOUND_TOKENS];

const STRUCTURED_ATTRS = ['id', 'name', 'autocomplete', 'class'];
const FREE_TEXT_ATTRS = ['placeholder', 'aria-label'];

/**
 * Splits an attribute value into lowercase word tokens, breaking on both
 * delimiters (space, `-`, `_`, etc.) and camelCase boundaries so `cardNumber`,
 * `card-number` and `card_number` all yield `['card', 'number']`.
 * @param {string} value - The raw attribute value
 * @returns {string[]} Lowercase tokens
 */
const tokenize = value => {
  if (!value || typeof value !== 'string') {
    return [];
  }

  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(token => token.toLowerCase());
};

/**
 * Collects the whole-word token set for a list of attributes on an element.
 * @param {Element} el - Element to read
 * @param {string[]} attrs - Attribute names to read
 * @returns {Set<string>} Set of lowercase tokens
 */
const tokenSet = (el, attrs) => {
  const tokens = new Set();

  attrs.forEach(attr => {
    tokenize(el.getAttribute(attr)).forEach(token => tokens.add(token));
  });

  return tokens;
};

/**
 * Concatenates a list of attributes into one lowercase, delimiter-stripped string
 * (used for compound-token substring matching, e.g. `user-name` → `username`).
 * @param {Element} el - Element to read
 * @param {string[]} attrs - Attribute names to read
 * @returns {string} Lowercase alphanumeric-only concatenation
 */
const compactText = (el, attrs) => attrs
  .map(attr => el.getAttribute(attr) || '')
  .join(' ')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

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
 * Strong tokens are matched against every attribute; weak (prose-ambiguous)
 * tokens only against the structured attributes.
 * @param {Element} el - Element to check
 * @returns {boolean} True if the field matches a deny token and is not one-time-code
 */
const isDeniedField = el => {
  if (!el || typeof el.getAttribute !== 'function') {
    return false;
  }

  if (hasOneTimeCode(el)) {
    return false;
  }

  const structuredTokens = tokenSet(el, STRUCTURED_ATTRS);
  const freeTextTokens = tokenSet(el, FREE_TEXT_ATTRS);

  if (WEAK_DENY_TOKENS.some(token => structuredTokens.has(token))) {
    return true;
  }

  const structuredCompact = compactText(el, STRUCTURED_ATTRS);

  if (WEAK_COMPOUND_TOKENS.some(token => structuredCompact.includes(token))) {
    return true;
  }

  return STRONG_DENY_TOKENS.some(token => structuredTokens.has(token) || freeTextTokens.has(token));
};

export { OTP_DENY_TOKENS, STRONG_DENY_TOKENS, WEAK_DENY_TOKENS, WEAK_COMPOUND_TOKENS, hasOneTimeCode, isDeniedField, tokenize };
export default isDeniedField;
