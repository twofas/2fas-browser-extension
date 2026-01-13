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

const months = [
  browser.i18n.getMessage('january'),
  browser.i18n.getMessage('february'),
  browser.i18n.getMessage('march'),
  browser.i18n.getMessage('april'),
  browser.i18n.getMessage('may'),
  browser.i18n.getMessage('june'),
  browser.i18n.getMessage('july'),
  browser.i18n.getMessage('august'),
  browser.i18n.getMessage('september'),
  browser.i18n.getMessage('october'),
  browser.i18n.getMessage('november'),
  browser.i18n.getMessage('december')
];

export default months;
