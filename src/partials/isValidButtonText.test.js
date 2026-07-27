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

import { describe, it, expect } from 'vitest';
import { isValidButtonText, isSubmitButtonText } from './isValidButtonText.js';

// Lightweight stand-in for a button element: getButtonText only reads
// innerText/value/aria-label/title and isSubmitTypedControl reads nodeName + the
// IDL `.type` property, so a plain object is enough (no DOM). `.type` is exposed
// directly (not via getAttribute) to mirror the IDL property the code now reads.
const makeButton = ({ innerText, value, ariaLabel, title, nodeName, type } = {}) => ({
  innerText,
  value,
  nodeName,
  type,
  getAttribute: name => {
    if (name === 'aria-label') {
      return ariaLabel ?? null;
    }

    if (name === 'title') {
      return title ?? null;
    }

    if (name === 'type') {
      return type ?? null;
    }

    return null;
  }
});

describe('isSubmitButtonText (U4 Set lookup — behaviour preserved)', () => {
  it('matches a known submit label', () => {
    expect(isSubmitButtonText(makeButton({ innerText: 'Verify' }))).toBe(true);
    expect(isSubmitButtonText(makeButton({ innerText: 'Continue' }))).toBe(true);
  });

  it('matches non-Latin submit labels', () => {
    expect(isSubmitButtonText(makeButton({ innerText: '确认' }))).toBe(true);
  });

  it('rejects labels that are not in the submit list', () => {
    expect(isSubmitButtonText(makeButton({ innerText: 'totally unrelated' }))).toBe(false);
  });

  it('rejects empty / whitespace-only labels', () => {
    expect(isSubmitButtonText(makeButton({ innerText: '   ' }))).toBe(false);
    expect(isSubmitButtonText(makeButton({}))).toBe(false);
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    expect(isSubmitButtonText(makeButton({ innerText: '  VERIFY  ' }))).toBe(true);
  });
});

describe('isValidButtonText (U4 Set lookup — behaviour preserved)', () => {
  it('accepts a meaningful label that is not on the ignore list', () => {
    expect(isValidButtonText(makeButton({ innerText: 'Verify' }))).toBe(true);
  });

  it('rejects labels on the ignore list', () => {
    expect(isValidButtonText(makeButton({ innerText: 'Cancel' }))).toBe(false);
    expect(isValidButtonText(makeButton({ innerText: 'Search' }))).toBe(false);
  });

  it('rejects icon-only buttons with no resolvable label', () => {
    expect(isValidButtonText(makeButton({ innerText: '   ' }))).toBe(false);
  });

  it('falls back to value/aria-label/title when innerText is empty', () => {
    expect(isSubmitButtonText(makeButton({ value: 'Submit' }))).toBe(true);
    expect(isSubmitButtonText(makeButton({ ariaLabel: 'Confirm' }))).toBe(true);
    expect(isValidButtonText(makeButton({ title: 'Cancel' }))).toBe(false);
  });
});

describe('isValidButtonText — label-less submit controls (M1 regression)', () => {
  it('keeps an icon-only button[type="submit"] with no resolvable label', () => {
    expect(isValidButtonText(makeButton({ nodeName: 'BUTTON', type: 'submit' }))).toBe(true);
  });

  it('keeps a value-less input[type="submit"] (UA-default label)', () => {
    expect(isValidButtonText(makeButton({ nodeName: 'INPUT', type: 'submit', value: '' }))).toBe(true);
  });

  it('still rejects an icon-only generic button (no submit type, no label)', () => {
    expect(isValidButtonText(makeButton({ nodeName: 'BUTTON' }))).toBe(false);
    expect(isValidButtonText(makeButton({ nodeName: 'BUTTON', type: 'button' }))).toBe(false);
  });

  it('still rejects a submit-typed control whose resolvable label is on the ignore list', () => {
    expect(isValidButtonText(makeButton({ nodeName: 'BUTTON', type: 'submit', innerText: 'Cancel' }))).toBe(false);
  });
});
