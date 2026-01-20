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

/**
 * Checks if a button has valid submit text (included in allowed texts and not in ignored texts).
 *
 * @param {HTMLElement} element - The button element to check
 * @returns {boolean} True if the button text is valid for submission
 */
const isValidButtonText = element => {
  const text = element?.innerText;

  if (!text || typeof text !== 'string') {
    return true;
  }

  const normalizedText = text.trim().toLowerCase();

  if (!normalizedText) {
    return true;
  }

  return !ignoreButtonTexts().includes(normalizedText);
};

/**
 * Checks if a button text matches the allowed submit button texts.
 *
 * @param {HTMLElement} element - The button element to check
 * @returns {boolean} True if the button text is in the allowed submit texts list
 */
const isSubmitButtonText = element => {
  const text = element?.innerText;

  if (!text || typeof text !== 'string') {
    return true;
  }

  const normalizedText = text.trim().toLowerCase();

  if (!normalizedText) {
    return true;
  }

  return buttonsTexts.includes(normalizedText);
};

export { isValidButtonText, isSubmitButtonText };
