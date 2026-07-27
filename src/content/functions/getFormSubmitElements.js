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

import formSubmitSelectors from '@partials/formSubmitSelectors.js';
import formSubmitSecondSelectors from '@partials/formSubmitSecondSelectors.js';
import { isValidButtonText, isSubmitButtonText } from '@partials/isValidButtonText.js';
import isVisible from '@partials/isVisible.js';
import { querySelectorAllDeep, collectAllShadowRoots } from '@content/functions/shadowDomUtils.js';

/**
 * Finds and returns submit button elements in the document.
 * Searches both the main document and any shadowRoots.
 * Hidden buttons are excluded per-level so the waterfall falls through
 * to broader selectors when a level returns only hidden matches.
 *
 * @returns {HTMLElement[]} Array of visible submit button elements
 */
const getFormSubmitElements = () => {
  // Collect shadow roots once and reuse across the selector waterfall instead
  // of re-walking the whole DOM on each querySelectorAllDeep call (up to 3×).
  const shadowRoots = collectAllShadowRoots();

  let submits = querySelectorAllDeep(formSubmitSelectors(), shadowRoots).filter(isVisible);

  if (submits.length === 0) {
    submits = querySelectorAllDeep(formSubmitSecondSelectors(), shadowRoots).filter(isVisible);
  }

  if (submits.length === 0) {
    const buttons = querySelectorAllDeep('input[type="button"],button', shadowRoots);
    submits = buttons.filter(isSubmitButtonText).filter(isVisible);
  }

  return submits.filter(isValidButtonText);
};

export default getFormSubmitElements;
