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

import inputsSelectors from '@partials/inputsSelectors.js';
import formSubmitSelectors from '@partials/formSubmitSelectors.js';
import formSubmitSecondSelectors from '@partials/formSubmitSecondSelectors.js';
import { isValidButtonText, isSubmitButtonText } from '@partials/isValidButtonText.js';
import isVisible from '@partials/isVisible.js';
import isDeniedField from '@partials/otpFieldHeuristics.js';
import { querySelectorAllDeep, collectAllShadowRoots } from '@content/functions/shadowDomUtils.js';

/**
 * Finds and returns all visible form input elements and submit buttons in the document.
 * Searches both the main document and any shadowRoots. The submit-selector waterfall
 * falls through to broader patterns when a level returns only hidden matches, and
 * hidden elements are stripped from the final result so they don't pollute
 * data-twofas-element-number numbering used by clickClosestSubmit.
 *
 * @returns {HTMLElement[]} Array of visible input and submit elements (in DOM order)
 */
const getFormElements = () => {
  // Collect shadow roots once and reuse across every deep query in this pass,
  // instead of re-walking the whole DOM on each querySelectorAllDeep call.
  const shadowRoots = collectAllShadowRoots();

  const inputsSelector = inputsSelectors();
  let submitsSelector = formSubmitSelectors();
  let requiresTextCheck = false;

  if (querySelectorAllDeep(submitsSelector, shadowRoots).filter(isVisible).length === 0) {
    submitsSelector = formSubmitSecondSelectors();
  }

  if (querySelectorAllDeep(submitsSelector, shadowRoots).filter(isVisible).length === 0) {
    submitsSelector = 'button';
    requiresTextCheck = true;
  }

  const query = `${inputsSelector},${submitsSelector}`;
  let elements = querySelectorAllDeep(query, shadowRoots);

  if (requiresTextCheck) {
    elements = elements.filter(element => {
      const nodeName = element.nodeName.toLowerCase();

      if (nodeName === 'input') {
        return true;
      }

      if (nodeName === 'button') {
        return isSubmitButtonText(element);
      }

      return false;
    });
  }

  return elements
    .filter(element => {
      const nodeName = element.nodeName.toLowerCase();

      if (nodeName !== 'button') {
        return true;
      }

      return isValidButtonText(element);
    })
    // Drop inputs that look like CVC/postal/coupon/recovery/etc. so they do not
    // pollute the element numbering used for auto-submit proximity.
    .filter(element => element.nodeName.toLowerCase() !== 'input' || !isDeniedField(element))
    .filter(isVisible);
};

export default getFormElements;
