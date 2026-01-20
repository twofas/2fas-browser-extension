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
import { v4 as uuidv4 } from 'uuid';
import getOSName from './getOSName';
import isBrave from './isBrave';
import getBrowserVersion from './getBrowserVersion';

/**
 * Gets browser information including name, version, and OS.
 * @returns {Object} Object containing browser name, version, and OS.
 */
const getBrowserInfo = () => {
  const randomID = uuidv4().substring(0, 4);
  const osName = getOSName();
  const userAgent = navigator.userAgent;
  let browserName = 'unknown';

  const nameRegex = {
    UCBrowser: /ucbrowser/i,
    Edge: /edg/i,
    Vivaldi: /vivaldi/i,
    Chromium: /chromium/i,
    Firefox: /firefox|fxios/i,
    Seamonkey: /seamonkey/i,
    Chrome: /chrome|crios/i,
    NotChrome: /opr|opera|chromium|edg|ucbrowser/i,
    Safari: /safari/i,
    NotSafari: /chromium|edg|ucbrowser|chrome|crios|opr|opera|fxios|firefox/i,
    Opera: /opr|opera/i
  };

  const versionRegex = {
    UCBrowser: /(ucbrowser)\/([\d.]+)/i,
    Edge: /(edge|edga|edgios|edg)\/([\d.]+)/i,
    Chromium: /(chromium)\/([\d.]+)/i,
    Firefox: /(firefox|fxios)\/([\d.]+)/i,
    Chrome: /(chrome|crios)\/([\d.]+)/i,
    Brave: /(chrome|crios)\/([\d.]+)/i,
    Safari: /(version)\/([\d.]+) safari/i,
    Opera: /(opera|opr)\/([\d.]+)/i,
    Vivaldi: /(vivaldi)\/([\d.]+)/i,
    unknown: null
  };

  if (nameRegex.UCBrowser.test(userAgent)) {
    browserName = 'UCBrowser';
  } else if (nameRegex.Edge.test(userAgent)) {
    browserName = 'Edge';
  } else if (nameRegex.Vivaldi.test(userAgent)) {
    browserName = 'Vivaldi';
  } else if (nameRegex.Chromium.test(userAgent)) {
    browserName = 'Chromium';
  } else if (nameRegex.Firefox.test(userAgent) && !nameRegex.Seamonkey.test(userAgent)) {
    browserName = 'Firefox';
  } else if (nameRegex.Chrome.test(userAgent) && !nameRegex.NotChrome.test(userAgent)) {
    browserName = isBrave() ? 'Brave' : 'Chrome';
  } else if (nameRegex.Safari.test(userAgent) && !nameRegex.NotSafari.test(userAgent)) {
    browserName = 'Safari';
  } else if (nameRegex.Opera.test(userAgent)) {
    browserName = 'Opera';
  }

  const browserVersion = getBrowserVersion(userAgent, versionRegex[browserName]);

  return {
    name: `${browserName} ${browser.i18n.getMessage('browserOnOs')} ${osName} (${randomID})`,
    browser_name: browserName,
    browser_version: browserVersion
  };
};

export default getBrowserInfo;
