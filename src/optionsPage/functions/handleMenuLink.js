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

const S = require('../../selectors');

const handleMenuLink = function (e) {
  e.preventDefault();
  e.stopPropagation();

  const menuName = this.getAttribute('data-twofas-menu');
  const menuLinks = document.querySelectorAll(S.optionsPage.menuLink);

  menuLinks.forEach(el => {
    if (el.getAttribute('data-twofas-menu') === menuName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  })

  const optionsContent = document.querySelectorAll(S.optionsPage.content);

  optionsContent.forEach(el => {
    const contentName = el.getAttribute('data-twofas-content');

    if (contentName === menuName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

module.exports = handleMenuLink;
