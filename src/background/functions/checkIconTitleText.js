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

import browser from 'webextension-polyfill';
import showNativePush from '@notification/functions/showNativePush.js';
import config from '@/config.js';

/**
 * Checks if a tab is active for 2FA by examining the extension icon title.
 *
 * @param {number} tabID - The ID of the tab to check
 * @returns {Promise<boolean>} True if the tab is active and action can proceed, false if inactive
 */
const checkIconTitleText = async tabID => {
  if (!tabID || tabID < 0) {
    return true;
  }

  if (process.env.EXT_PLATFORM === 'Safari') {
    return true;
  }

  try {
    const iconTitle = await browser.action.getTitle({ tabId: tabID });
    const inactiveTabMessage = browser.i18n.getMessage('inActiveTabInfo');

    if (iconTitle === inactiveTabMessage) {
      showNativePush(config.Texts.Error.InactiveTab, true);
      return false;
    }

    return true;
  } catch {
    return true;
  }
};

export default checkIconTitleText;
