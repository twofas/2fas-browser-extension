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
import browser from 'webextension-polyfill';

/**
 * Detects and returns the operating system name from the user agent.
 *
 * @returns {string} The detected operating system name
 */
const getOSName = () => {
  let osName = browser.i18n.getMessage('unknownOS');

  if (navigator.userAgentData) {
    osName = navigator.userAgentData.platform;
  } else {
    if (navigator.userAgent.indexOf('Windows') !== -1) {
      osName = 'Windows';
    }

    if (navigator.userAgent.indexOf('Mac') !== -1) {
      osName = 'macOS';
    }

    if (navigator.userAgent.indexOf('X11') !== -1) {
      osName = 'UNIX';
    }

    if (navigator.userAgent.indexOf('Linux') !== -1) {
      osName = 'Linux';
    }
  }

  return osName;
};

export default getOSName;
