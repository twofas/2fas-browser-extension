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

import browser from 'webextension-polyfill';

/**
 * Mapping of element types to their i18n attribute targets.
 */
const ELEMENT_ATTRIBUTE_MAP = {
  img: 'alt',
  input: 'placeholder',
  textarea: 'placeholder'
};

/**
 * Applies internationalized text to DOM elements with data-i18n attribute.
 * @returns {void}
 */
const i18n = () => {
  const elements = document.querySelectorAll('[data-i18n]');

  elements.forEach(element => {
    const i18nID = element.getAttribute('data-i18n');
    const message = browser.i18n.getMessage(i18nID);

    if (!message) {
      console.log(`i18n: ${i18nID} not found`);
      return;
    }

    const tagName = element.localName;
    const targetAttribute = ELEMENT_ATTRIBUTE_MAP[tagName];

    if (targetAttribute) {
      element.setAttribute(targetAttribute, message);
    } else {
      element.textContent = message;
    }
  });
};

export default i18n;
