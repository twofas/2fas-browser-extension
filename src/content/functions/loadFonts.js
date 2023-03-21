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

/* global FontFace */
// NEWEGG ETC. FIX
const loadFonts = () => {
  if (document.fonts.check('bold 16px Montserrat') && document.fonts.check('normal 16px Montserrat')) {
    return false;
  }

  const browser = require('webextension-polyfill');

  let fonts = [
    new FontFace(
      'Montserrat',
      `url(${browser.runtime.getURL('fonts/montserrat-v25-latin-700.woff2')})`,
      { style: 'normal', weight: '700' }
    ),
    new FontFace(
      'Montserrat',
      `url(${browser.runtime.getURL('fonts/montserrat-v25-latin-regular.woff2')})`,
      { style: 'normal', weight: '400' }
    )
  ];

  fonts.forEach(font => document.fonts.add(font));

  window.addEventListener('beforeunload', () => {
    fonts.forEach(font => document.fonts.delete(font));
    fonts = null;
  }, { once: true });
};

module.exports = loadFonts;
