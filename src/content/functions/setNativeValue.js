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

/* global HTMLInputElement, HTMLTextAreaElement */

/**
 * Sets an input/textarea value through the native prototype setter.
 *
 * Frameworks with controlled inputs (React in particular) install their own
 * value tracker as an own-property setter on the element and ignore a plain
 * `element.value = x` assignment, so the dispatched `input` event carries a
 * value the framework believes is unchanged and the update is dropped. Calling
 * the prototype setter bypasses that tracker so the framework observes the new
 * value. Harmless on Vue/Angular/Svelte/vanilla inputs.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement} element - Target field
 * @param {string} value - Value to assign
 * @returns {boolean} True if a native setter was used, false on plain fallback
 */
const setNativeValue = (element, value) => {
  if (!element) {
    return false;
  }

  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;

  const prototypeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  const ownDescriptor = Object.getOwnPropertyDescriptor(element, 'value');

  const prototypeSetter = prototypeDescriptor && prototypeDescriptor.set;
  const ownSetter = ownDescriptor && ownDescriptor.set;

  try {
    // React installs an instance-level tracker; prefer the prototype setter when it differs.
    if (prototypeSetter && ownSetter && ownSetter !== prototypeSetter) {
      prototypeSetter.call(element, value);
      return true;
    }

    if (prototypeSetter) {
      prototypeSetter.call(element, value);
      return true;
    }
  } catch {
    // Fall through to the plain assignment below.
  }

  element.value = value;
  return false;
};

export default setNativeValue;
