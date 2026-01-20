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
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';

const MAX_ICON_TYPE = 2;
const ICON_SIZES = [16, 32, 48, 96, 128];

/**
 * Builds the icon filename suffix based on icon type and active state.
 *
 * @param {number} iconType - The icon type (0, 1, or 2)
 * @param {boolean} isActive - Whether the tab is active for 2FA
 * @returns {string} The icon filename suffix
 */
const buildIconSuffix = (iconType, isActive) => {
  const typeSuffix = iconType > 0 ? `_${iconType}` : '';
  const stateSuffix = isActive ? '' : 'gray';

  return `${typeSuffix}${stateSuffix}`;
};

/**
 * Gets the validated icon type from storage.
 *
 * @returns {Promise<number>} The icon type (0, 1, or 2)
 */
const getIconType = async () => {
  const storage = await loadFromLocalStorage(['extIcon']);
  const rawType = storage?.extIcon;

  if (rawType === undefined || rawType === null || isNaN(rawType)) {
    return 0;
  }

  const parsedType = parseInt(rawType, 10);

  return (parsedType > 0 && parsedType <= MAX_ICON_TYPE) ? parsedType : 0;
};

/**
 * Builds the icon object with paths for different icon sizes based on active state and icon type.
 *
 * @param {number|null} tabID - The ID of the tab, or null for global icon
 * @param {boolean} isActive - Whether the tab is active for 2FA
 * @returns {Promise<Object>} A promise that resolves to the icon object with paths
 */
const getIconObj = async (tabID, isActive) => {
  const iconType = await getIconType();
  const suffix = buildIconSuffix(iconType, isActive);

  const path = ICON_SIZES.reduce((acc, size) => {
    acc[size] = browser.runtime.getURL(`images/icons/icon${size}${suffix}.png`);
    return acc;
  }, {});

  const iconObj = { path };

  if (tabID) {
    iconObj.tabId = tabID;
  }

  return iconObj;
};

/**
 * Sets the extension icon and optionally updates the title for a specific tab.
 *
 * @param {number|null} tabID - The ID of the tab, or null for global icon
 * @param {boolean} [isActive=true] - Whether to show the active or inactive icon
 * @param {boolean} [changeTitle=false] - Whether to update the icon title when inactive
 * @returns {Promise<void>}
 */
const setIcon = async (tabID, isActive = true, changeTitle = false) => {
  if (process.env.EXT_PLATFORM === 'Safari') {
    return;
  }

  const iconObj = await getIconObj(tabID, isActive);

  await browser.action.setIcon(iconObj);

  if (isActive || changeTitle) {
    const iconTitle = isActive
      ? '2FAS - Two Factor Authentication'
      : browser.i18n.getMessage('inActiveTabInfo');

    await browser.action.setTitle({ tabId: tabID, title: iconTitle });
  }
};

export default setIcon;
