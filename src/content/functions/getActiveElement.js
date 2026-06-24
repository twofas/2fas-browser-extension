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

import { v4 as uuidv4 } from 'uuid';
import clearFormElementsNumber from '@content/functions/clearFormElementsNumber.js';
import addFormElementsNumber from '@content/functions/addFormElementsNumber.js';
import getFormElements from '@content/functions/getFormElements.js';
import findFallbackOtpInput from '@content/functions/findFallbackOtpInput.js';
import { getDeepActiveElement, collectAllShadowRoots } from '@content/functions/shadowDomUtils.js';

/**
 * Checks whether an element can receive an autofilled token: a native
 * input/textarea, or a contenteditable host (which covers ARIA textbox-style
 * fields — they are contenteditable in practice). A non-input element that is
 * not contenteditable has no reliable text-setting path, so it is rejected to
 * avoid writing a phantom value and falsely passing the pre-submit check.
 *
 * @param {Element} element - Element to check
 * @returns {boolean} True if the element is a fillable target
 */
const isFillableTarget = element => {
  if (!element) {
    return false;
  }

  const nodeName = element.nodeName?.toLowerCase();

  if (nodeName === 'input' || nodeName === 'textarea') {
    return true;
  }

  return element.isContentEditable === true;
};

/**
 * Gets the currently focused element and marks it with a unique identifier.
 * Traverses shadowRoots to find deeply nested focused elements. Accepts native
 * inputs/textareas, contenteditable hosts and ARIA textbox roles. When nothing
 * fillable is focused, falls back to a single unambiguous
 * `autocomplete="one-time-code"` field so the token can still be autofilled.
 *
 * @returns {Object} Status object with nodeName and input ID (null if no target)
 */
const getActiveElement = () => {
  const activeElement = getDeepActiveElement();
  let target = isFillableTarget(activeElement) ? activeElement : null;

  // Walk the DOM for shadow roots once and reuse it for both the fallback
  // lookup and the form-element numbering below, instead of collecting twice.
  const shadowRoots = collectAllShadowRoots();

  // R3: no fillable element focused → try a spec-blessed one-time-code field.
  if (!target) {
    target = findFallbackOtpInput(shadowRoots);
  }

  if (!target) {
    return {
      status: 'activeElement',
      nodeName: activeElement ? activeElement.nodeName.toLowerCase() : undefined,
      id: null
    };
  }

  const inputUUID = uuidv4();
  target.setAttribute('data-twofas-input', inputUUID);

  clearFormElementsNumber();
  addFormElementsNumber(getFormElements(shadowRoots));

  return {
    status: 'activeElement',
    nodeName: target.nodeName.toLowerCase(),
    id: inputUUID
  };
};

export default getActiveElement;
