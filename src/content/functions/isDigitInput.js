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
 * Whether an input's type can plausibly hold an OTP digit. By default excludes
 * `password`: auto-typing a token into a masked secret field would be a harmful
 * mis-fill (the single-field / free-text fallback path). Detection contexts that
 * gather a segmented group — where a single-char `password` box is a legitimate
 * OTP cell — pass `{ allowPassword: true }`. A field with no `type` defaults to
 * `text` and is accepted.
 * @param {HTMLElement} el - Input to check.
 * @param {Object} [options]
 * @param {boolean} [options.allowPassword=false] - Whether to accept `type="password"`.
 * @returns {boolean} True when the input type can hold an OTP digit.
 */
const isDigitInput = (el, { allowPassword = false } = {}) => {
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  const allowed = allowPassword ? ['text', 'tel', 'number', 'password'] : ['text', 'tel', 'number'];
  return allowed.includes(type);
};

export default isDigitInput;
