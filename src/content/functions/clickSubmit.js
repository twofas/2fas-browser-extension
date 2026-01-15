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
import delay from '@partials/delay.js';
import { isValidButtonText } from '@partials/isValidButtonText.js';

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

/**
 * Gets the element number attribute value from an element.
 *
 * @param {HTMLElement} element - The element to get the number from
 * @returns {number} The element number or -999 if not found
 */
const getElementNumber = element => {
  return parseInt(element?.getAttribute('data-twofas-element-number') || '-999', 10);
};

/**
 * Tries to find and click a submit button within the input's form.
 *
 * @param {HTMLElement} inputElement - The input element
 * @returns {boolean} True if a form submit button was found and clicked
 */
const tryFormSubmit = inputElement => {
  const form = inputElement?.closest('form');

  if (!form) {
    return false;
  }

  const formSubmits = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));

  if (formSubmits.length !== 1) {
    return false;
  }

  const submitButton = formSubmits[0];

  if (isValidButtonText(submitButton)) {
    safeClick(submitButton);

    return true;
  }

  return false;
};

/**
 * Finds and clicks the closest submit button based on element positioning.
 *
 * @param {HTMLElement} inputElement - The input element
 * @param {HTMLElement[]} submits - Array of submit elements
 */
const clickClosestSubmit = (inputElement, submits) => {
  if (submits.length === 0) {
    return;
  }

  const inputNumber = getElementNumber(inputElement);
  const submitNumbers = submits.map(getElementNumber);
  const closestIndex = findClosestIndex(submitNumbers, inputNumber);

  if (closestIndex >= 0 && submits[closestIndex]) {
    safeClick(submits[closestIndex]);
  }
};

/**
 * Automatically clicks the submit button closest to the input element after token insertion.
 *
 * @param {HTMLElement} inputElement - The input element where the token was inserted
 * @param {string} siteURL - The current site URL for exclusion checking
 * @returns {Promise<boolean>} Promise that resolves to true if submit was clicked, false otherwise
 */
const clickSubmit = (inputElement, siteURL) => {
  return delay(() => {}, 500)
    .then(() => loadFromLocalStorage(['autoSubmitExcludedDomains', 'autoSubmitEnabled']))
    .then(storage => {
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

      if (tryFormSubmit(inputElement)) {
        return true;
      }

      clickClosestSubmit(inputElement, submits);

      return true;
    })
    .catch(async err => {
      await storeLog('error', 46, err, 'clickSubmit');

      return false;
    });
};

export default clickSubmit;
