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

const S = require('../selectors');

const hidePreloader = (installPage = false, state = undefined) => {
  const preloadElement = document.querySelector(S.preload);

  if (preloadElement) {
    preloadElement.classList.remove('show-preloader');
  }

  if (installPage) {
    if (state === 'configured') {
      const configuredElement = document.querySelector(S.installPage.configured);

      if (configuredElement) {
        configuredElement.classList.remove('hidden');
      }
    } else {
      const newDeviceElement = document.querySelector(S.installPage.newDevice);

      if (newDeviceElement) {
        newDeviceElement.classList.remove('hidden');
      }
    }
  }

  setTimeout(() => {
    const twofasToggle = document.querySelectorAll(S.optionsPage.toggle);

    if (twofasToggle.length <= 0) {
      return false;
    }

    twofasToggle.forEach(el => el.classList.add('loaded'));
  }, 450);
};

module.exports = hidePreloader;
