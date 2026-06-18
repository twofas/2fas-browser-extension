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
import isDeniedField from '@partials/otpFieldHeuristics.js';
import detectOtpInputs from '@content/functions/detectOtpInputs.js';
import { querySelectorAllDeep } from '@content/functions/shadowDomUtils.js';

/**
 * Finds a high-confidence OTP input to target when nothing is focused.
 *
 * Uses only the spec-blessed `autocomplete="one-time-code"` signal so a token
 * can still be autofilled (instead of falling back to a copy notification)
 * without the risk of picking the wrong field. Returns a target only when the
 * match is unambiguous: exactly one visible candidate, or several candidates
 * that together form a single segmented OTP group (its first box is returned).
 *
 * @param {ShadowRoot[]} [shadowRoots] - Pre-collected shadow roots to reuse
 * @returns {HTMLElement|null} The fallback input to fill, or null when ambiguous
 */
const findFallbackOtpInput = (shadowRoots = null) => {
  const candidates = querySelectorAllDeep('input[autocomplete="one-time-code" i]', shadowRoots)
    .filter(isVisible)
    .filter(el => !isDeniedField(el));

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  // Multiple matches are only safe if they are the boxes of one segmented group.
  const group = detectOtpInputs(candidates[0]);

  if (group.mode === 'segmented' && candidates.every(candidate => group.boxes.includes(candidate))) {
    return candidates[0];
  }

  return null;
};

export default findFallbackOtpInput;
