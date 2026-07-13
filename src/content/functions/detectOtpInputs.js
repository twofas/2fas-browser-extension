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
import isDigitInput from '@content/functions/isDigitInput.js';

const MIN_SEGMENTED_BOXES = 4;
const MAX_SEGMENTED_BOXES = 12;
const MAX_ANCESTOR_WALK = 4;

/**
 * Checks whether an element is an editable target that has no `.value`
 * (contenteditable or an ARIA textbox role on a non-input element).
 * @param {Element} el - Element to check
 * @returns {boolean} True if the element is a value-less editable target
 */
const isContentEditableTarget = el => {
  if (!el) {
    return false;
  }

  const nodeName = el.nodeName?.toLowerCase();

  if (nodeName === 'input' || nodeName === 'textarea') {
    return false;
  }

  return el.isContentEditable === true;
};

/**
 * Checks whether an input holds a single character (a segmented OTP box).
 * @param {HTMLInputElement} el - Input to check
 * @returns {boolean} True if maxlength is 1
 */
const isSingleCharInput = el => {
  if (!el || el.nodeName?.toLowerCase() !== 'input') {
    return false;
  }

  return el.maxLength === 1 || el.getAttribute('maxlength') === '1';
};

/**
 * Collects an ordered group of single-character sibling inputs around the
 * focused box, walking up a few ancestors until a plausible group is found.
 * @param {HTMLInputElement} focused - The focused single-char input
 * @returns {HTMLInputElement[]} Ordered boxes (in DOM order), or [] if no group
 */
const collectSegmentedGroup = focused => {
  let container = focused.parentElement;

  for (let level = 0; level < MAX_ANCESTOR_WALK && container; level++) {
    const boxes = Array.from(container.querySelectorAll('input'))
      .filter(isSingleCharInput)
      .filter(el => isDigitInput(el, { allowPassword: true }))
      .filter(isVisible);

    if (
      boxes.length >= MIN_SEGMENTED_BOXES &&
      boxes.length <= MAX_SEGMENTED_BOXES &&
      boxes.includes(focused)
    ) {
      return boxes;
    }

    container = container.parentElement;
  }

  return [];
};

/**
 * Classifies the fill target around the focused element.
 *
 * Returns one of:
 *  - { mode: 'segmented', boxes: [...] } — N single-char OTP boxes (the "6 boxes" pattern)
 *  - { mode: 'contenteditable', boxes: [el] } — value-less editable target
 *  - { mode: 'single', boxes: [el] } — a single input/textarea
 *
 * @param {Element} focused - The focused (or fallback) element to classify
 * @returns {{mode: string, boxes: Element[]}} Classification result
 */
const detectOtpInputs = focused => {
  if (!focused) {
    return { mode: 'single', boxes: [] };
  }

  if (isContentEditableTarget(focused)) {
    return { mode: 'contenteditable', boxes: [focused] };
  }

  if (isSingleCharInput(focused)) {
    const boxes = collectSegmentedGroup(focused);

    if (boxes.length > 0) {
      return { mode: 'segmented', boxes };
    }
  }

  return { mode: 'single', boxes: [focused] };
};

export { MIN_SEGMENTED_BOXES, isContentEditableTarget, isSingleCharInput };
export default detectOtpInputs;
