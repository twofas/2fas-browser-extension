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

/* global navigator */

/**
 * Detects if the user is using the Brave browser.
 * @returns {boolean} True if the user is using Brave, false otherwise.
 */
const isBrave = () => {
  if (navigator?.userAgentData?.brands) {
    return navigator.userAgentData.brands.filter(item => item?.brand?.includes('Brave')).length > 0;
  }

  if (navigator.brave !== undefined) {
    return navigator.brave.isBrave.name === 'isBrave';
  }

  return false;
};

export default isBrave;
