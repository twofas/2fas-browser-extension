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
 * Generates and sets the platform-specific shortcut settings link on the edit button.
 *
 * @returns {void}
 */
const generateShortcutLink = () => {
  const editBtn = document.querySelector(S.optionsPage.shortcut.edit);
  let link;

  if (!editBtn) {
    return;
  }

  switch (process.env.EXT_PLATFORM) {
    case 'Chrome':
      link = 'chrome://extensions/shortcuts';
      break;
    case 'Edge':
      link = 'edge://extensions/shortcuts';
      break;
    case 'Opera':
      link = 'opera://extensions/shortcuts';
      break;
    case 'Firefox':
      link = 'about:addons';
      break;
    case 'Safari':
      link = '#';
      break;
    default:
      link = 'chrome://extensions/shortcuts';
  }

  editBtn.setAttribute('data-shortcut-link', link);
};

export default generateShortcutLink;
