//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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

const i18n = () => {
  let elements = document.querySelectorAll('[data-i18n]');

  elements.forEach(element => {
    let type = element.localName.toLowerCase();
    let i18nID = element.getAttribute('data-i18n');
    let m = browser.i18n.getMessage(i18nID);

    if (!m) {
      console.log(`i18n: ${i18nID} not found`);
      return false;
    }

    if (type === 'img') {
      element.setAttribute('alt', m);
    } else if (type === 'input') {
      element.setAttribute('placeholder', m);
    } else {
      element.innerText = m;
    }

    type = null;
    i18nID = null;
    m = null;
  });

  elements = null;
};

export default i18n;
