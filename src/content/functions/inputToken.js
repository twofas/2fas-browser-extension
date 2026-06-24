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

/* global Event, KeyboardEvent, InputEvent, DataTransfer, ClipboardEvent */
import wait from '@partials/wait.js';
import getTabData from '@content/functions/getTabData.js';
import clickSubmit from '@content/functions/clickSubmit.js';
import clearAfterInputToken from '@content/functions/clearAfterInputToken.js';
import setNativeValue from '@content/functions/setNativeValue.js';
import detectOtpInputs, { isContentEditableTarget } from '@content/functions/detectOtpInputs.js';
import { getDeepActiveElement } from '@content/functions/shadowDomUtils.js';

// Base cadence between keystrokes — fast enough to feel instant, still slow
// enough for per-character validators (U3). The rise below is the exception.
const KEYSTROKE_DELAY_MS = 40;
// Applied only to segmented OTP widgets (the "6 boxes" pattern), where focus
// moves box-to-box between digits and the widget may need time to re-render.
const SEGMENTED_ADVANCE_DELAY_MS = 150;
const PASTE_SETTLE_MS = 120;

/**
 * Checks whether an element is a native input/textarea (a valid keystroke target).
 * @param {Element} element - Element to check
 * @returns {boolean} True for input/textarea
 */
const isFillableInput = element => {
  const nodeName = element?.nodeName?.toLowerCase();
  return nodeName === 'input' || nodeName === 'textarea';
};

/**
 * Picks the pause before the next keystroke. Fast by default; rises only for
 * segmented OTP widgets, where focus moves box-to-box and the widget may need
 * time to re-render between digits (U3 adaptive rhythm).
 * @param {boolean} isSegmented - Whether the fill target is a segmented OTP group
 * @returns {number} Delay in milliseconds before the next keystroke
 */
const keystrokeDelay = isSegmented => (isSegmented ? SEGMENTED_ADVANCE_DELAY_MS : KEYSTROKE_DELAY_MS);

/**
 * Reads the current text of a fill target (value or, for contenteditable, textContent).
 * @param {Element} element - Element to read
 * @returns {string} Current text
 */
const getElementText = element => {
  if (!element) {
    return '';
  }

  if (isContentEditableTarget(element)) {
    return element.textContent || '';
  }

  return element.value || '';
};

/**
 * Normalizes a code for comparison (drops spaces and dashes used by formatters).
 * @param {string} value - Value to normalize
 * @returns {string} Normalized value
 */
const normalizeCode = value => (value || '').replace(/[\s-]/g, '');

/**
 * Verifies the token has actually landed in the target(s) — handles a single
 * field, a segmented group (concatenated boxes), and contenteditable.
 * @param {{mode: string, boxes: Element[]}} group - Detected target group
 * @param {string} token - Expected token
 * @returns {boolean} True if the filled value matches the token
 */
const isTokenFilled = (group, token) => {
  const expected = normalizeCode(token);

  if (!expected) {
    return false;
  }

  if (group.mode === 'segmented') {
    const values = group.boxes.map(element => normalizeCode(getElementText(element)));

    if (values.join('') !== expected) {
      return false;
    }

    // Guard against the whole code piled into one box (a widget that did not
    // auto-advance): require it to be genuinely distributed, one char per box,
    // so auto-submit never fires on a malformed fill.
    const filledBoxes = values.filter(value => value.length > 0);

    return filledBoxes.length === expected.length && filledBoxes.every(value => value.length === 1);
  }

  return normalizeCode(getElementText(group.boxes[0])) === expected;
};

/**
 * Clears a single fill target and notifies frameworks of the change.
 * @param {Element} element - Element to clear
 */
const clearField = element => {
  if (!element) {
    return;
  }

  try {
    if (isContentEditableTarget(element)) {
      element.textContent = '';
    } else {
      setNativeValue(element, '');
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
      which: 0
    }));
  } catch {
    // Best-effort clear; ignore elements that reject programmatic mutation.
  }
};

/**
 * Clears every box of a detected group.
 * @param {{boxes: Element[]}} group - Detected target group
 */
const clearGroup = group => group.boxes.forEach(clearField);

/**
 * Dispatches keyboard + input events for a single digit and sets the element's
 * value through the native prototype setter (so React-controlled fields update).
 * @param {HTMLElement} element - Target element for the events
 * @param {string} digit - Single digit character to type
 * @param {number} keyCode - Key code for the digit (48-57 for 0-9)
 * @param {string} valueForElement - The full value the element should hold afterwards
 */
const dispatchKeystrokeEvents = (element, digit, keyCode, valueForElement) => {
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

  setNativeValue(element, valueForElement);

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
 * Decides whether to attempt a paste-based fill before keystroke simulation.
 * Paste only helps managed widgets (segmented groups, contenteditable editors,
 * or single inputs flagged with one-time-code); a plain input gains nothing and
 * would just pay the settle delay, so type into it directly.
 * @param {{mode: string, boxes: Element[]}} group - Detected target group
 * @returns {boolean} True if a paste attempt is worthwhile
 */
const shouldTryPaste = group => {
  if (group.mode === 'segmented' || group.mode === 'contenteditable') {
    return true;
  }

  const target = group.boxes[0];
  const autocomplete = (target?.getAttribute?.('autocomplete') || '').toLowerCase();

  return autocomplete.includes('one-time-code');
};

/**
 * Attempts to fill the token by dispatching a synthetic paste carrying the full
 * code, letting the widget's own paste handler distribute it (the robust path
 * for segmented "6 boxes" components). Returns whether the token actually landed.
 * @param {{mode: string, boxes: Element[]}} group - Detected target group
 * @param {string} token - Token to paste
 * @returns {Promise<boolean>} True if verified filled after the paste
 */
const tryPasteFill = async (group, token) => {
  const target = group.boxes[0];

  if (!target) {
    return false;
  }

  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', token);

    target.focus();
    target.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    }));
  } catch {
    return false;
  }

  await wait(PASTE_SETTLE_MS);

  return isTokenFilled(group, token);
};

/**
 * Writes a token into a contenteditable target (best-effort, single pass).
 * @param {HTMLElement} element - Contenteditable element
 * @param {string} token - Token to write
 */
const writeContentEditable = (element, token) => {
  try {
    element.focus();
    element.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: token,
      inputType: 'insertText'
    }));
    element.textContent = token;
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: token,
      inputType: 'insertText'
    }));
  } catch {
    // Best-effort; contenteditable editors vary widely.
  }
};

/**
 * Fills the token by simulating keystrokes. Follows focus across segmented
 * boxes, but only ever writes into the anchor element or a detected group box —
 * if focus escapes to an unrelated/non-input element the digit is not written
 * there (prevents overwriting e.g. a password field the user clicked mid-fill).
 * @param {HTMLElement} inputElement - The anchor (tagged) element
 * @param {{mode: string, boxes: Element[]}} group - Detected target group
 * @param {string} token - Token to type
 * @returns {Promise<void>}
 */
const simulateTyping = async (inputElement, group, token) => {
  if (group.mode === 'contenteditable') {
    writeContentEditable(inputElement, token);
    return;
  }

  inputElement.focus();

  const isAllowedTarget = element => element === inputElement || group.boxes.includes(element);
  // Adaptive rhythm (U3): a segmented group moves focus box-to-box and may
  // re-render between digits, so it keeps the longer cadence; a single field
  // types fast. Keyed off the detected mode, so there is no focus-timing race.
  const isSegmented = group.mode === 'segmented';
  let accumulated = '';

  // Writes one digit into the current (allowed) target, skipping the keystroke if
  // focus escaped to an element we must not touch (R10 abort guard).
  const typeDigit = digit => {
    const keyCode = 48 + Number(digit);
    let activeElement = getDeepActiveElement();

    if (!isFillableInput(activeElement) || !isAllowedTarget(activeElement)) {
      if (isFillableInput(inputElement)) {
        inputElement.focus();
        activeElement = inputElement;
      } else {
        return;
      }
    }

    let valueForElement;

    if (activeElement === inputElement) {
      accumulated += digit;
      valueForElement = accumulated;
    } else {
      // Focus auto-advanced to another box (segmented) — it holds one digit.
      valueForElement = digit;
    }

    dispatchKeystrokeEvents(activeElement, digit, keyCode, valueForElement);
  };

  for (let i = 0; i < token.length; i++) {
    typeDigit(token[i]);

    // The final keystroke needs no trailing wait.
    if (i < token.length - 1) {
      await wait(keystrokeDelay(isSegmented));
    }
  }
};

/**
 * Inputs a 2FA token into the resolved target. Tries a paste-based fill first
 * for managed widgets, falls back to keystroke simulation, verifies the result,
 * and only then (and only when verified) triggers auto-submit.
 * @param {Object} request - Request object containing the token
 * @param {HTMLElement} inputElement - Target input element (tagged/focused/fallback)
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

  const token = String(request.token);
  const group = detectOtpInputs(inputElement);

  let filled = false;

  // R6: try paste first for managed widgets, then fall back to simulation.
  if (shouldTryPaste(group)) {
    try {
      filled = await tryPasteFill(group, token);
    } catch {
      filled = false;
    }
  }

  if (!filled) {
    clearGroup(group);

    try {
      await simulateTyping(inputElement, group, token);
    } catch {
      clearAfterInputToken(inputElement);
      return { status: 'error', url: siteURL };
    }
  }

  // R10: confirm the token landed before auto-submitting (handles 1 and 6 fields).
  const verified = isTokenFilled(group, token);

  let tab = {};

  try {
    tab = await getTabData();
  } catch {
    clearAfterInputToken(inputElement);
    return { status: 'completed', url: siteURL };
  }

  if (verified && tab?.status === 'complete') {
    clickSubmit(inputElement, siteURL);
  }

  clearAfterInputToken(inputElement);

  return { status: 'completed', url: siteURL };
};

export { keystrokeDelay };
export default inputToken;
