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

/* global Event, KeyboardEvent, InputEvent */
import runTasksWithDelay from '@partials/runTasksWithDelay.js';
import getTabData from '@content/functions/getTabData.js';
import clickSubmit from '@content/functions/clickSubmit.js';
import clearAfterInputToken from '@content/functions/clearAfterInputToken.js';
import { getDeepActiveElement } from '@content/functions/shadowDomUtils.js';

const KEYSTROKE_DELAY_MS = 150;

/**
 * Dispatches keyboard events to simulate typing a single digit.
 * @param {HTMLElement} element - Target element for the events
 * @param {string} digit - Single digit character to type
 * @param {number} keyCode - Key code for the digit (48-57 for 0-9)
 */
const dispatchKeystrokeEvents = (element, digit, keyCode) => {
  const keyboardEventOptions = {
    bubbles: true,
    cancelable: true,
    charCode: 0,
    code: `Digit${digit}`,
    ctrlKey: false,
    key: digit,
    keyCode,
    location: 0,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    which: keyCode
  };

  element.dispatchEvent(new KeyboardEvent('keydown', keyboardEventOptions));
  element.dispatchEvent(new KeyboardEvent('keypress', { ...keyboardEventOptions, charCode: keyCode }));

  const inputType = element.type?.toLowerCase();

  if (inputType === 'number') {
    element.value += Number(digit);
  } else {
    element.value += digit;
  }

  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    data: digit,
    inputType: 'insertText',
    which: 0
  }));

  element.dispatchEvent(new KeyboardEvent('keyup', keyboardEventOptions));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
};

/**
 * Inputs a 2FA token into the specified input element by simulating keystrokes.
 * @param {Object} request - Request object containing the token
 * @param {HTMLElement} inputElement - Target input element
 * @param {string} siteURL - URL of the current site
 * @returns {Promise<Object>} Result object with status and url
 */
const inputToken = async (request, inputElement, siteURL) => {
  if (!request?.token) {
    return { status: 'error' };
  }

  if (!inputElement) {
    return { status: 'emptyInput' };
  }

  const tasks = [];

  inputElement.value = '';
  inputElement.focus();

  for (let i = 0; i < request.token.length; i++) {
    tasks.push(() => {
      const digit = request.token[i];
      const keyCode = 48 + Number(digit);
      const activeElement = getDeepActiveElement();

      if (activeElement !== inputElement) {
        activeElement.value = '';
      }

      dispatchKeystrokeEvents(activeElement, digit, keyCode);
    });
  }

  await runTasksWithDelay(tasks, KEYSTROKE_DELAY_MS);

  let tab = {};

  try {
    tab = await getTabData();
  } catch {
    return { status: 'completed', url: siteURL };
  }

  if (tab?.status === 'complete') {
    clickSubmit(inputElement, siteURL);
  }

  clearAfterInputToken(inputElement, tab?.id);

  return { status: 'completed', url: siteURL };
};

export default inputToken;
