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

const getIconObj = async (tabID, isActive) => {
  const MAX_TYPE = 2;

  let type = 0;
  let typeFilename = '';
  let iconFileName = '';

  const storage = await loadFromLocalStorage(['extIcon']);

  if (storage && storage?.extIcon && !isNaN(storage.extIcon)) {
    type = parseInt(storage.extIcon, 10);

    if (type > MAX_TYPE) {
      type = 0;
    }
  }

  if (type !== 0) {
    typeFilename = `_${type}`;
  }

  iconFileName = isActive ? typeFilename : `${typeFilename}gray`;

  const iconObj = {
    path: {
      16: browser.runtime.getURL(`images/icons/icon16${iconFileName}.png`),
      32: browser.runtime.getURL(`images/icons/icon32${iconFileName}.png`),
      48: browser.runtime.getURL(`images/icons/icon48${iconFileName}.png`),
      96: browser.runtime.getURL(`images/icons/icon96${iconFileName}.png`),
      128: browser.runtime.getURL(`images/icons/icon128${iconFileName}.png`)
    }
  };

  if (tabID) {
    iconObj.tabId = tabID;
  }

  return iconObj;
};

const setIcon = async (tabID, isActive = true, changeTitle = false) => {
  if (process.env.EXT_PLATFORM === 'Safari') {
    return false;
  }

  const iconObj = await getIconObj(tabID, isActive);
  const iconTitle = isActive ? '2FAS - Two Factor Authentication' : browser.i18n.getMessage('inActiveTabInfo');

  await browser.action.setIcon(iconObj);

  if (isActive || (!isActive && changeTitle)) {
    await browser.action.setTitle({ tabId: tabID, title: iconTitle });
  }
};

export default setIcon;
