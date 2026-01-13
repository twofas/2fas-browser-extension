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

import { loadFromLocalStorage, saveToLocalStorage } from '../localStorage/index.js';
import config from '../config.js';
import SDK from '../sdk/index.js';

const logDebounceMap = new Map();
const DEBOUNCE_TIME_MS = 30000;
const CLEANUP_THRESHOLD_MS = 300000;

/**
 * Masks URLs for privacy in logs.
 * @param {string} url - The URL to mask.
 * @return {string} The masked URL.
 */
const logURL = url => {
  return url
    .replaceAll('http', 'h**p')
    .replaceAll('://', ':**')
    .replaceAll('www', 'w*w')
    .replaceAll('.', '*');
};

/**
 * Checks if a log should be debounced based on logID and error message.
 * @param {number} logID - The log identifier.
 * @param {string} errorMessage - The error message.
 * @return {boolean} True if the log should be skipped.
 */
const shouldDebounce = (logID, errorMessage) => {
  const key = `${logID}-${errorMessage || ''}`;
  const lastLogTime = logDebounceMap.get(key);
  const now = Date.now();

  if (lastLogTime && (now - lastLogTime) < DEBOUNCE_TIME_MS) {
    return true;
  }

  logDebounceMap.set(key, now);

  for (const [mapKey, time] of logDebounceMap.entries()) {
    if (now - time > CLEANUP_THRESHOLD_MS) {
      logDebounceMap.delete(mapKey);
    }
  }

  return false;
};

/**
 * Stores error logs to the 2FAS backend.
 * @async
 * @param {string} level - Log level (info, warning, error, debug).
 * @param {number} logID - The log identifier.
 * @param {Error|Event|Object} errObj - The error object.
 * @param {string} url - The URL context for the error.
 * @return {Promise<boolean|void>}
 */
const storeLog = async (level, logID = 0, errObj, url = '') => {
  let m = 'Unknown Error';
  let c = { logID };
  let storage = null;

  console.error(logID, url);
  console.dir(errObj);

  switch (true) {
    case errObj instanceof Event: {
      m = 'EventError';
      c.errorInfo = {
        currentTargetURL: errObj?.currentTarget?.url || '',
        path: errObj?.path || [],
        type: errObj?.type || '',
        code: errObj?.code || '',
        reason: errObj?.reason || ''
      };

      break;
    }

    case errObj instanceof Error:
    case errObj instanceof SyntaxError:
    case errObj instanceof ReferenceError:
    case errObj instanceof TypeError: {
      m = errObj.name || 'Error';
      c.errorInfo = {
        message: errObj?.message || '',
        stack: errObj?.stack || '',
        toString: errObj?.toString() || '',
        cause: errObj?.cause || ''
      };

      break;
    }

    default: {
      m = errObj?.message || 'Unknown Error';
      c.errorInfo = errObj;
      break;
    }
  }

  try {
    storage = await loadFromLocalStorage(['logging', 'extensionID', 'browserInfo']);
  } catch (err) {
    console.error(err);
    return false;
  }

  if (!('logging' in storage)) {
    storage = await saveToLocalStorage({ logging: false }, storage);
  }

  if (!storage.logging) {
    storage = null;
    m = null;
    c = null;
    return false;
  }

  if (
    (storage?.browserInfo?.browser_name === 'Firefox' && storage?.browserInfo?.browser_version === '105.0' && logID === 14) ||
    (storage?.browserInfo?.browser_name === 'Chrome' && storage?.browserInfo?.browser_version === '107' && logID === 14) ||
    (storage?.browserInfo?.browser_name === 'Chrome' && storage?.browserInfo?.browser_version === '107.0.0.0' && logID === 14) ||
    (c?.errorInfo?.message?.includes('FILE_ERROR_NO_SPACE')) ||
    (c?.errorInfo.status === 407) ||
    (c?.errorInfo?.message?.includes('An unexpected error occurred')) ||
    (c?.errorInfo?.message?.includes('Refused to run the JavaScript URL')) ||
    (c?.errorInfo?.message?.includes('QuotaExceededError: storage.local API call exceeded its quota limitations')) ||
    (c?.errorInfo?.statusText?.includes('Proxy Authentication Required'))
  ) {
    storage = null;
    m = null;
    c = null;
    return false;
  }

  const errorMessage = c?.errorInfo?.message || m;

  if (shouldDebounce(logID, errorMessage)) {
    storage = null;
    m = null;
    c = null;
    return false;
  }

  c.errorType = errObj?.constructor?.name || '';
  c.extensionVersion = config.ExtensionVersion;
  c.browserInfo = storage.browserInfo;
  c.url = logURL(url);

  if (!url.includes('http')) {
    if (typeof window !== 'undefined' && window?.location?.href) {
      try {
        c.frontUrl = logURL(window?.location?.href);
      } catch (e) {}
    }
  }

  try {
    await new SDK().storeLog(storage.extensionID, level, m, c);
  } catch (err) {
    console.error('Failed to send log:', err);
  } finally {
    storage = null;
    m = null;
    c = null;
  }
};

export default storeLog;
