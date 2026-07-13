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

import isVisible from '@partials/isVisible.js';
import { otpSignalSelectors } from '@partials/inputsSelectors.js';
import isDeniedField from '@partials/otpFieldHeuristics.js';
import detectOtpInputs from '@content/functions/detectOtpInputs.js';
import { querySelectorAllDeep } from '@content/functions/shadowDomUtils.js';
import isDigitInput from '@content/functions/isDigitInput.js';

/**
 * Whether an input is a plausible focus-less fill target: visible, editable, and
 * not disabled/read-only.
 * @param {HTMLElement} el - Input to check
 * @returns {boolean}
 */
const isUsableInput = el => isVisible(el) && !el.disabled && !el.readOnly;

// Free-text (placeholder / aria-label) phrases that mark a LOCATION or PHONE "code"
// field — an "area code" / "zip code" / "postal code" / "country code" input. Such a
// field matches the OTP-signal selectors purely because its label contains the word
// "code", yet the shared deny-list (isDeniedField) only screens these weak tokens in
// STRUCTURED attributes, not free text — deliberately, so descriptive OTP placeholders
// like "Enter verification code" keep working. For the focus-less fallback — where the
// token is auto-typed into a single field with no user intent on that specific field —
// that asymmetry could mis-fill a lone phone/postal field (F6), so its free-text label
// is screened here (fallback path only, not numbering). Matched as compact,
// delimiter-stripped substrings so "area code", "area-code" and "areaCode" all match,
// while "verification code", "6-digit code" and "code sent to your phone" do NOT.
const LOCATION_CODE_PHRASES = ['areacode', 'zipcode', 'postcode', 'postalcode', 'countrycode', 'dialcode', 'phonecode'];

/**
 * Whether an input's free-text label denotes a location/phone "code" field (F6).
 * @param {HTMLElement} el - Input to check
 * @returns {boolean}
 */
const denotesLocationCode = el => {
  const text = `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return LOCATION_CODE_PHRASES.some(phrase => text.includes(phrase));
};

/**
 * Resolves a set of candidate inputs to a single target ONLY when the choice is
 * unambiguous: exactly one candidate, or several that together form one segmented
 * OTP group (its first box is returned). Anything else returns null — the caller
 * must not guess among multiple unrelated fields.
 * @param {HTMLElement[]} candidates - Candidate inputs
 * @returns {HTMLElement|null}
 */
const resolveUnambiguous = candidates => {
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const group = detectOtpInputs(candidates[0]);

  if (group.mode === 'segmented' && candidates.every(candidate => group.boxes.includes(candidate))) {
    return candidates[0];
  }

  return null;
};

/**
 * Finds a high-confidence OTP input to target when nothing is focused.
 *
 * Tiered and conservative — a token is only autofilled here (instead of falling
 * back to a copy notification) when the target is unambiguous, so it can never be
 * typed into someone else's field:
 *   1. The spec-blessed `autocomplete="one-time-code"` signal: exactly one field,
 *      or one segmented group. If several one-time-code fields exist but are not a
 *      single group, return null (the page clearly has OTP inputs — do not guess).
 *   2. Only when NO one-time-code field exists, the OTP-SIGNAL heuristics
 *      (otpSignalSelectors — fields carrying an actual OTP marker in id/name/
 *      placeholder/aria-label/autocomplete/data-*, NOT the generic text-input
 *      catch-all), restricted to visible, editable, digit-capable, non-denied
 *      inputs, and accepted ONLY when there is exactly one match or one segmented
 *      group (T1). Any ambiguity → null → copy notification. Using the OTP-signal
 *      set (not every text input) is what keeps a lone unrelated field — a phone
 *      number, a bare text box — from ever being targeted.
 *
 * @param {ShadowRoot[]} [shadowRoots] - Pre-collected shadow roots to reuse
 * @returns {HTMLElement|null} The fallback input to fill, or null when ambiguous
 */
const findFallbackOtpInput = (shadowRoots = null) => {
  const oneTimeCode = querySelectorAllDeep('input[autocomplete="one-time-code" i]', shadowRoots)
    .filter(isUsableInput);

  const oneTimeCodeTarget = resolveUnambiguous(oneTimeCode);

  if (oneTimeCodeTarget) {
    return oneTimeCodeTarget;
  }

  // Ambiguous one-time-code fields present: do not fall through to weaker heuristics.
  if (oneTimeCode.length > 0) {
    return null;
  }

  const heuristicCandidates = querySelectorAllDeep(otpSignalSelectors(), shadowRoots)
    .filter(el => el.nodeName?.toLowerCase() === 'input')
    .filter(el => isDigitInput(el))
    .filter(isUsableInput)
    .filter(el => !isDeniedField(el))
    .filter(el => !denotesLocationCode(el));

  return resolveUnambiguous(heuristicCandidates);
};

export default findFallbackOtpInput;
