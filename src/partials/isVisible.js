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

/**
 * Checks if a DOM element is visible.
 * @param {HTMLElement} domElement - The DOM element to check.
 * @return {boolean} True if the element is visible, false otherwise. True if domElement.checkVisibility is not a function.
 */
const isVisible = domElement => {
  if (!domElement) {
    return false;
  }

  if (typeof domElement.checkVisibility === 'function') {
    const browserVisible = domElement.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true
    });

    if (!browserVisible) {
      return false;
    }
  }

  const rect = domElement.getBoundingClientRect();

  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  const style = window.getComputedStyle(domElement);

  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  if (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(100%)') {
    return false;
  }

  // Note: We intentionally do NOT check viewport position here.
  // Elements scrolled out of view (rect.bottom < 0 or rect.top > viewportHeight)
  // are still valid targets for autofill - they exist in the DOM and can receive values.
  // We only want to filter out elements that are truly hidden (display:none,
  // visibility:hidden, zero dimensions, clipped, etc.).

  let parent = domElement.parentElement;

  while (parent && parent !== document.body && parent !== document.documentElement) {
    const parentStyle = window.getComputedStyle(parent);

    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
      return false;
    }

    if (parentStyle.display !== 'contents') {
      const parentRect = parent.getBoundingClientRect();

      if (parentRect.height === 0 || parentRect.width === 0) {
        return false;
      }
    }

    if (parseFloat(parentStyle.opacity) === 0) {
      return false;
    }

    parent = parent.parentElement;
  }

  return true;
};

export default isVisible;
