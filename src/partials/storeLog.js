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

// Matches any `scheme://…` sequence (http, https, ws, wss, ftp,
// chrome-extension, moz-extension, …) so URLs embedded anywhere in error
// data — messages, stack traces, event targets — can be masked.
const URL_REGEX = /[a-z][a-z0-9.+-]*:\/\/\S+/gi;
const MAX_SANITIZE_DEPTH = 6;

/**
 * Recursively masks every URL found within a value before it is sent to the
 * backend. Strings have their embedded URLs replaced via {@link logURL};
 * arrays, plain objects and Error objects are traversed (Error message/stack
 * are non-enumerable, so they are extracted explicitly). Other primitives are
 * returned unchanged. Cyclic references, excessive depth and throwing getters
 * are all guarded so a malformed error object can never hang, leak through an
 * unvisited branch, or blow up the logger.
 * @param {*} value - The value to sanitize.
 * @param {number} [depth=0] - Current recursion depth.
 * @param {WeakSet} [seen=new WeakSet()] - Objects already visited.
 * @return {*} A sanitized copy of the value.
 */
const sanitizeLogValue = (value, depth = 0, seen = new WeakSet()) => {
  if (typeof value === 'string') {
    return value.replace(URL_REGEX, match => logURL(match));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  // Beyond the depth limit, drop the sub-tree to a placeholder rather than
  // returning it raw — a raw object would carry unmasked URL strings to the
  // backend without ever being visited.
  if (depth >= MAX_SANITIZE_DEPTH) {
    return Array.isArray(value) ? '[array]' : '[object]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogValue(item, depth + 1, seen));
  }

  if (value instanceof Error) {
    return {
      name: value.name || '',
      message: sanitizeLogValue(value.message || '', depth + 1, seen),
      stack: sanitizeLogValue(value.stack || '', depth + 1, seen),
      cause: sanitizeLogValue(value.cause, depth + 1, seen)
    };
  }

  const result = {};

  for (const key of Object.keys(value)) {
    // A property may be backed by a throwing getter; never let that escape
    // storeLog, which is itself called from catch blocks across the codebase.
    try {
      result[key] = sanitizeLogValue(value[key], depth + 1, seen);
    } catch {
      result[key] = '[unserializable]';
    }
  }

  return result;
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
    (c?.errorInfo?.status === 407) ||
    (c?.errorInfo?.message?.includes('An unexpected error occurred')) ||
    (c?.errorInfo?.message?.includes('Refused to run the JavaScript URL')) ||
    (c?.errorInfo?.message?.includes('QuotaExceededError: storage.local API call exceeded its quota limitations')) ||
    (c?.errorInfo?.statusText?.includes('Proxy Authentication Required')) ||
    (c?.errorInfo?.message?.includes('Could not establish connection')) ||
    (c?.errorInfo?.message?.includes('Receiving end does not exist')) ||
    (c?.errorInfo?.message?.includes('Extension context invalidated')) ||
    (c?.errorInfo?.message?.includes('Invalid call to runtime.sendMessage')) ||
    (c?.errorInfo?.message?.includes('Tab not found')) ||
    (c?.errorInfo?.message?.includes('The message port closed before a response was received'))
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
  c.online = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : null;

  if (!url.includes('http')) {
    if (typeof window !== 'undefined' && window?.location?.href) {
      try {
        c.frontUrl = logURL(window?.location?.href);
      } catch (e) {}
    }
  }

  try {
    m = sanitizeLogValue(m);
    c.errorInfo = sanitizeLogValue(c.errorInfo);
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
