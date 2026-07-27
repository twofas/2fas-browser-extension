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

import buttonsTexts from '@partials/buttonsTexts.js';
import ignoreButtonTexts from '@partials/ignoreButtonTexts.js';

// Build the lookup tables once as Sets so each candidate button is an O(1)
// membership test instead of a linear scan over the large multilingual arrays
// (ignoreButtonTexts ~1175 entries, buttonsTexts ~342); getFormElements,
// getFormSubmitElements and clickSubmit call these per element.
const buttonsTextsSet = new Set(buttonsTexts);
let ignoreButtonTextsSet = null;

/**
 * Lazily builds and memoizes the ignored-texts Set (ignoreButtonTexts builds a
 * fresh array on every call, so it is only materialized once here).
 *
 * @returns {Set<string>} Set of normalized button labels to ignore
 */
const getIgnoreButtonTextsSet = () => {
  if (!ignoreButtonTextsSet) {
    ignoreButtonTextsSet = new Set(ignoreButtonTexts());
  }

  return ignoreButtonTextsSet;
};

/**
 * Whether the element is a control whose submit intent is declared by its type
 * (`<button type="submit">` / `<input type="submit">`). Such controls are valid
 * targets even without a text label — a UA-default-labelled `<input type="submit">`
 * (its `.value` is empty) or an icon-only `<button type="submit">` must not be
 * dropped, or auto-submit silently fails on forms whose only submit is unlabelled.
 *
 * Reads the IDL `.type` property, not the `type` attribute: a `<button>` with no
 * `type` attribute defaults to `submit` per the HTML spec, and `.type` reflects
 * that ('submit') while `getAttribute('type')` returns null — so an icon-only
 * default `<button>` (the only submit on many forms) would otherwise be dropped.
 *
 * @param {HTMLElement} element - The element to test
 * @returns {boolean} True for a submit-typed input/button
 */
const isSubmitTypedControl = element => {
  const nodeName = element?.nodeName?.toLowerCase();

  if (nodeName !== 'input' && nodeName !== 'button') {
    return false;
  }

  return (element.type || '').toLowerCase() === 'submit';
};

/**
 * Resolves a button's effective label, falling back to value/aria-label/title when innerText is empty.
 *
 * @param {HTMLElement} element - The button element to read
 * @returns {string} Normalized (trimmed, lowercased) label, or '' when none is found
 */
const getButtonText = element => {
  if (!element) {
    return '';
  }

  const candidates = [
    element.innerText,
    element.value,
    element.getAttribute('aria-label'),
    element.getAttribute('title')
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();

      if (normalized) {
        return normalized;
      }
    }
  }

  return '';
};

/**
 * Checks if a button has a resolvable label that is not in the ignored texts (icon-only buttons are rejected).
 *
 * @param {HTMLElement} element - The button element to check
 * @returns {boolean} True if the button text is valid for submission
 */
const isValidButtonText = element => {
  const normalizedText = getButtonText(element);

  if (!normalizedText) {
    // No resolvable label: keep submit-typed controls (their type proves intent),
    // reject everything else (e.g. icon-only generic buttons).
    return isSubmitTypedControl(element);
  }

  return !getIgnoreButtonTextsSet().has(normalizedText);
};

/**
 * Checks if a button's resolvable label matches the allowed submit button texts (icon-only buttons are rejected).
 *
 * @param {HTMLElement} element - The button element to check
 * @returns {boolean} True if the button text is in the allowed submit texts list
 */
const isSubmitButtonText = element => {
  const normalizedText = getButtonText(element);

  if (!normalizedText) {
    return false;
  }

  return buttonsTextsSet.has(normalizedText);
};

export { isValidButtonText, isSubmitButtonText };
