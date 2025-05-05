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

const ignoreButtonSelectors = () => {
  return [
    ':not([data-role*="search"])',
    ':not(#search-button)',
    ':not(#search)',
    ':not([class*="dropdown"])',
    ':not([class*="cancel"])',
    ':not([class*="checkbox"])',
    ':not([class*="mail"])',
    ':not([class*="phone"])',
    ':not([disabled])',
    ':not([style*="display:none"])',
    ':not([style*="opacity:0"])',
    ':not([style*="visibility:hidden"])',
    ':not([class*="twofas"])',
    ':not(#terminate_session_submit)',
    ':not(#signin-button)'
  ];
};

module.exports = ignoreButtonSelectors;
