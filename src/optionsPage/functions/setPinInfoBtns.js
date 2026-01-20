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
import handlePinInfo from '@optionsPage/functions/handlePinInfo.js';
import handlePinInfoNext from '@optionsPage/functions/handlePinInfoNext.js';
import handlePinInfoPrev from '@optionsPage/functions/handlePinInfoPrev.js';

/**
 * Attaches click event listeners to pin info navigation buttons.
 *
 * @returns {void}
 */
const setPinInfoBtns = () => {
  const gotIt = document.querySelector(S.optionsPage.pin.gotIt);
  const next = document.querySelectorAll(S.optionsPage.pin.next);
  const prev = document.querySelector(S.optionsPage.pin.prev);

  if (gotIt) {
    gotIt.addEventListener('click', handlePinInfo);
  }

  if (next) {
    next.forEach(btn => {
      btn.addEventListener('click', handlePinInfoNext);
    });
  }

  if (prev) {
    prev.addEventListener('click', handlePinInfoPrev);
  }
};

export default setPinInfoBtns;
