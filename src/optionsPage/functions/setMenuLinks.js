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

import S from '@/selectors.js';
import handleMenuLink from '@optionsPage/functions/handleMenuLink.js';

/**
 * Attaches click event listeners to all menu navigation links.
 *
 * @returns {void}
 */
const setMenuLinks = () => {
  const menuLinks = document.querySelectorAll(S.optionsPage.menuLink);
  menuLinks.forEach(el => el.addEventListener('click', handleMenuLink));
};

export default setMenuLinks;
