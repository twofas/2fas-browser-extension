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

/**
 * Handles click on the advanced settings header to toggle its visibility.
 *
 * @param {Event} e - The click event
 * @returns {void}
 */
const handleAdvancedHeaderClick = e => {
  e.preventDefault();
  e.stopPropagation();

  document.querySelector(S.optionsPage.advanced.header).classList.toggle('open');
  document.querySelector(S.optionsPage.advanced.content).classList.toggle('visible');
};

export default handleAdvancedHeaderClick;
