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

const browser = require('webextension-polyfill');

const setIcon = async (tabId, active = true, changeTitle = false) => {
  console.log('setIcon', tabId, active, changeTitle);

  const iconObj =
    active ?
    {
      path: {
        16: browser.runtime.getURL('images/icons/icon16.png'),
        32: browser.runtime.getURL('images/icons/icon32.png'),
        48: browser.runtime.getURL('images/icons/icon48.png'),
        96: browser.runtime.getURL('images/icons/icon96.png'),
        128: browser.runtime.getURL('images/icons/icon128.png')
      },
      tabId
    } : {
      path: {
        16: browser.runtime.getURL('images/icons/icon16gray.png'),
        32: browser.runtime.getURL('images/icons/icon32gray.png'),
        48: browser.runtime.getURL('images/icons/icon48gray.png'),
        96: browser.runtime.getURL('images/icons/icon96gray.png'),
        128: browser.runtime.getURL('images/icons/icon128gray.png')
      },
      tabId
    };
    
  const iconTitle = active ? '2FAS - Two Factor Authentication' : browser.i18n.getMessage('inActiveTabInfo');

  if (process.env.EXT_PLATFORM === 'Firefox' || process.env.EXT_PLATFORM === 'Safari') {
    browser.browserAction.setIcon(iconObj);

    if (active || (!active && changeTitle)) {
      await browser.browserAction.setTitle({ tabId, title: iconTitle });
    }
  } else {
    browser.action.setIcon(iconObj);

    if (active || (!active && changeTitle)) {
      await browser.action.setTitle({ tabId, title: iconTitle });
    }
  }
};

module.exports = setIcon;
