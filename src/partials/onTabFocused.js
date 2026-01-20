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
 * Executes a callback based on the current tab visibility state.
 * @param {Function} onFocus - Callback to execute when tab is visible
 * @param {Function} onBlur - Callback to execute when tab is hidden
 * @returns {void}
 */
const onTabFocused = (onFocus, onBlur) => {
  if (document.visibilityState === 'visible') {
    if (typeof onFocus === 'function') {
      onFocus();
    }
  } else {
    if (typeof onBlur === 'function') {
      onBlur();
    }
  }
};

export default onTabFocused;
