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

import getFormSubmitElements from '@content/functions/getFormSubmitElements.js';
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';
import storeLog from '@partials/storeLog.js';
import wait from '@partials/wait.js';
import { isValidButtonText } from '@partials/isValidButtonText.js';
import isVisible from '@partials/isVisible.js';
import { closestDeep } from '@content/functions/shadowDomUtils.js';

/**
 * Finds the index of the value closest to the goal in an array.
 *
 * @param {number[]} counts - Array of numbers to search
 * @param {number} goal - Target number to find the closest match for
 * @returns {number} Index of the closest value in the array, or -1 if array is empty
 */
const findClosestIndex = (counts, goal) => {
  if (counts.length === 0) {
    return -1;
  }

  return counts.indexOf(
    counts.reduce((a, b) => {
      const aDiff = Math.abs(a - goal);
      const bDiff = Math.abs(b - goal);

      if (aDiff === bDiff) {
        return a > b ? a : b;
      }

      return bDiff < aDiff ? b : a;
    })
  );
};

/**
 * Extracts hostname from URL, removing www. prefix.
 *
 * @param {string} siteURL - The URL to parse
 * @returns {string|null} The normalized hostname or null if URL is invalid
 */
const extractHostname = siteURL => {
  try {
    const url = new URL(siteURL);

    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * Safely clicks an element with error handling.
 *
 * @param {HTMLElement} element - The element to click
 */
const safeClick = element => {
  try {
    element?.click();
  } catch {}
};

/**
 * Checks if auto-submit should be skipped for the given domain.
 *
 * @param {string[]} excludedDomains - List of excluded domain hostnames
 * @param {string} hostname - The current hostname to check
 * @returns {boolean} True if auto-submit should be skipped
 */
const isExcludedDomain = (excludedDomains, hostname) => {
  if (!hostname || !excludedDomains) {
    return false;
  }

  return excludedDomains.includes(hostname);
};

// Sentinel returned when an element was never assigned a position by
// addFormElementsNumber. Such candidates must be kept out of the proximity
// metric instead of being compared as a real number.
const NOT_NUMBERED = -999;

// Instead of a fixed settle delay before clicking submit, poll the chosen button's
// readiness: clicking a still-disabled button is a silent no-op, and debounced/async
// validators can take a beat to re-enable it after the token lands (T9). This is
// fast when the button is already enabled and patient (up to the budget) when it is
// not — better than a single fixed delay that is both too long for ready buttons and
// too short for slow validators.
const SUBMIT_READINESS_POLL_MS = 50;
const SUBMIT_READINESS_BUDGET_MS = 600;

/**
 * Waits until the element is clickable (not disabled) or the readiness budget
 * elapses, polling on a short interval. Resolves immediately for an already-enabled
 * button (the common case).
 * @param {HTMLElement} element - The submit control to wait on
 * @returns {Promise<void>}
 */
const waitForClickable = async element => {
  if (!element) {
    return;
  }

  const deadline = Date.now() + SUBMIT_READINESS_BUDGET_MS;

  while (element.disabled && Date.now() < deadline) {
    await wait(SUBMIT_READINESS_POLL_MS);
  }
};

/**
 * Gets the element number attribute value from an element.
 *
 * @param {HTMLElement} element - The element to get the number from
 * @returns {number} The element number, or NOT_NUMBERED if it has none
 */
const getElementNumber = element => {
  const raw = element?.getAttribute('data-twofas-element-number');

  if (raw === null || raw === undefined) {
    return NOT_NUMBERED;
  }

  const parsed = parseInt(raw, 10);

  return Number.isNaN(parsed) ? NOT_NUMBERED : parsed;
};

/**
 * Picks the single visible, label-valid submit button inside the input's form, if
 * there is exactly one. Traverses shadowRoots to find the form element.
 *
 * @param {HTMLElement} inputElement - The input element
 * @returns {HTMLElement|null} The form's sole submit button, or null
 */
const pickFormSubmit = inputElement => {
  const form = closestDeep(inputElement, 'form');

  if (!form) {
    return null;
  }

  const formSubmits = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'))
    .filter(isVisible);

  if (formSubmits.length !== 1) {
    return null;
  }

  const submitButton = formSubmits[0];

  return isValidButtonText(submitButton) ? submitButton : null;
};

/**
 * Picks the submit button closest to the input element based on element positioning.
 *
 * @param {HTMLElement} inputElement - The input element
 * @param {HTMLElement[]} submits - Array of submit elements
 * @returns {HTMLElement|null} The closest submit element, or null
 */
const pickClosestSubmit = (inputElement, submits) => {
  if (submits.length === 0) {
    return null;
  }

  const inputNumber = getElementNumber(inputElement);

  // Only candidates that share the input's numbering space can be compared by
  // proximity. Unnumbered submits — from selector drift between the numbering
  // pass (getFormElements) and the click candidates (getFormSubmitElements), or
  // from DOM mutation in between — would otherwise enter the metric as -999 and
  // skew the result, so they are dropped here.
  const numbered = submits
    .map(submit => ({ submit, number: getElementNumber(submit) }))
    .filter(entry => entry.number !== NOT_NUMBERED);

  // Without usable numbering the metric is meaningless; fall back to the first
  // submit in DOM order (getFormSubmitElements returns elements in DOM order).
  if (inputNumber === NOT_NUMBERED || numbered.length === 0) {
    return submits[0];
  }

  const closestIndex = findClosestIndex(numbered.map(entry => entry.number), inputNumber);

  if (closestIndex >= 0 && numbered[closestIndex]) {
    return numbered[closestIndex].submit;
  }

  return null;
};

/**
 * Automatically clicks the submit button closest to the input element after token
 * insertion, waiting for the button to become clickable (T9) rather than pausing a
 * fixed amount before clicking.
 *
 * @param {HTMLElement} inputElement - The input element where the token was inserted
 * @param {string} siteURL - The current site URL for exclusion checking
 * @returns {Promise<boolean>} Promise that resolves to true if submit was clicked, false otherwise
 */
const clickSubmit = async (inputElement, siteURL) => {
  try {
    const storage = await loadFromLocalStorage(['autoSubmitExcludedDomains', 'autoSubmitEnabled']);

    if (!storage?.autoSubmitEnabled) {
      return false;
    }

    const excludedDomains = storage.autoSubmitExcludedDomains || [];
    const hostname = extractHostname(siteURL);

    if (isExcludedDomain(excludedDomains, hostname)) {
      return false;
    }

    const submits = getFormSubmitElements();

    if (submits.length === 0) {
      return false;
    }

    const target = pickFormSubmit(inputElement) || pickClosestSubmit(inputElement, submits);

    if (!target) {
      return false;
    }

    // Poll the chosen button's readiness before clicking: async/debounced
    // validators can leave it briefly disabled, and a click on a disabled button
    // is a silent no-op (the token is in the field but "nothing happened").
    await waitForClickable(target);

    // If the button never became clickable within the budget (still disabled) or was
    // detached from the document while we waited, clicking it does nothing — report
    // the auto-submit as NOT performed instead of falsely claiming success (F4), so
    // the documented `true = clicked` contract holds for any future caller.
    if (!target.isConnected || target.disabled) {
      return false;
    }

    safeClick(target);

    return true;
  } catch (err) {
    await storeLog('error', 46, err, 'clickSubmit');

    return false;
  }
};

export default clickSubmit;
export { findClosestIndex, extractHostname, isExcludedDomain };
