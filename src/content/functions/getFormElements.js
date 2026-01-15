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

/**
 * Finds and returns all form input elements and submit buttons in the current document.
 *
 * @returns {HTMLElement[]} Array of input and submit elements
 */
const getFormElements = () => {
  const inputsSelector = inputsSelectors();
  let submitsSelector = formSubmitSelectors();
  let requiresTextCheck = false;

  if (document.querySelectorAll(submitsSelector).length === 0) {
    submitsSelector = formSubmitSecondSelectors();
  }

  if (document.querySelectorAll(submitsSelector).length === 0) {
    submitsSelector = 'button';
    requiresTextCheck = true;
  }

  const query = `${inputsSelector},${submitsSelector}`;
  let elements = Array.from(document.querySelectorAll(query));

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

  return elements.filter(element => {
    const nodeName = element.nodeName.toLowerCase();

    if (nodeName !== 'button') {
      return true;
    }

    return isValidButtonText(element);
  });
};

export default getFormElements;
