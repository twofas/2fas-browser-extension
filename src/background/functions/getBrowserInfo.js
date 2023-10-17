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

/* global navigator */
const browser = require('webextension-polyfill');
const getOSName = require('./getOSName');

const getBrowserInfo = () => {
  const userAgent = {
    Chrome: /Chrom(?:e|ium)\/([0-9.]+)/,
    Firefox: /Firefox\/([0-9.]+)/,
    Opera: /(OPR|Opera)\/([0-9.]+)/,
    Edge: /Edge?\/([0-9.]+)/,
    Safari: /Safari?\/([0-9.]+)/
  };

  const isBrave = () => {
    if (navigator?.userAgentData?.brands) {
      return navigator.userAgentData.brands.filter(item => item?.brand?.includes('Brave')).length > 0;
    } else if (navigator.brave !== undefined) {
      return navigator.brave.isBrave.name === 'isBrave';
    } else {
      return false;
    }
  };

  let browserVersion = navigator.userAgentData.brands.filter(item => {
    if (item && item?.brand) {
      return item?.brand?.includes('Chromium');
    }

    return false;
  });

  if (browserVersion.length > 0) {
    browserVersion = browserVersion[0].version;
  } else {
    const uA = navigator.userAgent.match(userAgent[process.env.EXT_PLATFORM]);

    if (process.env.EXT_PLATFORM === 'Opera') {
      browserVersion = (uA == null || uA.length !== 3) ? browser.i18n.getMessage('unknown') : uA[2];
    } else {
      browserVersion = (uA == null || uA.length !== 2) ? browser.i18n.getMessage('unknown') : uA[1];
    }
  }

  switch (process.env.EXT_PLATFORM) {
    case 'Chrome': {
      const brave = isBrave();

      return {
        name: `${brave ? 'Brave' : 'Chrome'} ${browser.i18n.getMessage('browserOnOs')} ${getOSName()}`,
        browser_name: brave ? 'Brave' : 'Chrome',
        browser_version: browserVersion
      };
    }

    case 'Firefox': {
      return {
        name: `Firefox ${browser.i18n.getMessage('browserOnOs')} ${getOSName()}`,
        browser_name: 'Firefox',
        browser_version: browserVersion
      };
    }

    case 'Opera': {
      return {
        name: `Opera ${browser.i18n.getMessage('browserOnOs')} ${getOSName()}`,
        browser_name: 'Opera',
        browser_version: browserVersion
      };
    }

    case 'Edge': {
      return {
        name: `Microsoft Edge ${browser.i18n.getMessage('browserOnOs')} ${getOSName()}`,
        browser_name: 'Microsoft Edge',
        browser_version: browserVersion
      };
    }

    case 'Safari': {
      return {
        name: `Safari ${browser.i18n.getMessage('browserOnOs')} ${getOSName()}`,
        browser_name: 'Safari',
        browser_version: browserVersion
      }
    }

    default: {
      throw new Error('EXT_PLATFORM is undefined');
    }
  }
};

module.exports = getBrowserInfo;
