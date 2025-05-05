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

const { loadFromLocalStorage, saveToLocalStorage } = require('../localStorage');
const config = require('../config');
const SDK = require('../sdk');

const logURL = url => {
  return url
    .replaceAll('http', 'h**p')
    .replaceAll('://', ':**')
    .replaceAll('www', 'w*w')
    .replaceAll('.', '*');
};

const storeLog = async (level, logID = 0, errObj, url = '') => {
  let m = 'Unknown Error';
  let c = { logID };
  let storage;

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
  }

  if (!('logging' in storage)) {
    storage = await saveToLocalStorage({ logging: false }, storage);
  }

  // Logs turned off
  if (!storage.logging) {
    return false;
  }

  // Ignored logs
  if (
    (storage?.browserInfo?.browser_name === 'Firefox' && storage?.browserInfo?.browser_version === '105.0' && logID === 14) ||
    (storage?.browserInfo?.browser_name === 'Chrome' && storage?.browserInfo?.browser_version === '107' && logID === 14) ||
    (storage?.browserInfo?.browser_name === 'Chrome' && storage?.browserInfo?.browser_version === '107.0.0.0' && logID === 14) ||
    (c?.errorInfo?.message?.includes('FILE_ERROR_NO_SPACE')) ||
    (c?.errorInfo.status === 407) ||
    (c?.errorInfo?.message?.includes('An unexpected error occurred')) ||
    (c?.errorInfo?.message?.includes('Refused to run the JavaScript URL')) ||
    (c?.errorInfo?.message?.includes('QuotaExceededError: storage.local API call exceeded its quota limitations')) || // @TODO: future
    (c?.errorInfo?.statusText?.includes('Proxy Authentication Required'))
  ) {
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

  return new SDK().storeLog(storage.extensionID, level, m, c)
    .then(() => {
      storage = null;
      m = null;
      c = null;
    });
};

module.exports = storeLog;
