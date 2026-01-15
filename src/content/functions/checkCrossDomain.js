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

/**
 * Checks if the current frame is a cross-domain iframe.
 * @returns {Object} Object with isCrossDomain flag and domain info.
 */
const checkCrossDomain = () => {
  const result = {
    isCrossDomain: false,
    currentHostname: '',
    topHostname: ''
  };

  try {
    result.currentHostname = new URL(window.location.href).hostname;
  } catch {
    return result;
  }

  if (window.self === window.top) {
    return result;
  }

  result.isCrossDomain = true;

  try {
    result.topHostname = new URL(window.top.location.href).hostname;
  } catch {
    // Cannot access top.location due to cross-domain security
  }

  return result;
};

export default checkCrossDomain;
