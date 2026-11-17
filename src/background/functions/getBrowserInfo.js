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
import loadFromLocalStorage from '@localStorage/loadFromLocalStorage.js';

/**
 * Detects browser name and version from the current userAgent.
 * Returns fresh values on every call — useful when the user upgrades their browser.
 * @returns {{ browserName: string, browserVersion: string }}
 */
const detectBrowser = () => {
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

  return { browserName, browserVersion };
};

/**
 * Builds a default human-readable extension name with a random 4-char suffix.
 * The suffix exists so multiple installs of the same browser/OS get distinguishable names —
 * once generated it MUST be persisted in storage; never regenerate it on subsequent reads.
 * @param {string} browserName
 * @param {string} osName
 * @returns {string}
 */
const buildDefaultName = (browserName, osName) => {
  const randomID = uuidv4().substring(0, 4);
  const pattern = browser.i18n.getMessage('deviceNamePattern') || 'BROWSER on OS (ID)';

  // Word order is part of the copy, so the whole shape lives in the catalogue;
  // single-pass replace keeps inserted values from being re-scanned for tokens.
  return pattern.replace(/BROWSER|OS|ID/g, token => {
    if (token === 'BROWSER') {
      return browserName;
    }

    return token === 'OS' ? osName : randomID;
  });
};

/**
 * Returns browser information, preferring the persisted extension name from storage.
 *
 * - `browser_name` and `browser_version` are always derived freshly from navigator.userAgent,
 *   so a browser upgrade is detected and propagated.
 * - `name` is read from storage if present (preserves the original random suffix and any
 *   user-set name from extNameUpdate). A new default name is generated only when there is
 *   no stored value, or when `force: true` is passed (used by storageReset and the first
 *   install path where a fresh identity is desired).
 *
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - When true, always generate a fresh default name
 *                                          (ignores storage). Use for storageReset / install.
 * @returns {Promise<{ name: string, browser_name: string, browser_version: string }>}
 */
const getBrowserInfo = async ({ force = false } = {}) => {
  const { browserName, browserVersion } = detectBrowser();
  const osName = getOSName();

  let name;

  if (!force) {
    try {
      const stored = await loadFromLocalStorage('browserInfo');
      const storedName = stored?.browserInfo?.name;

      if (typeof storedName === 'string' && storedName.trim() !== '') {
        name = storedName;
      }
    } catch (e) {
      // Storage unavailable — fall back to a fresh default name below.
    }
  }

  if (!name) {
    name = buildDefaultName(browserName, osName);
  }

  return {
    name,
    browser_name: browserName,
    browser_version: browserVersion
  };
};

export default getBrowserInfo;
