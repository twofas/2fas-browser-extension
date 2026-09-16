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

/* global CryptoKey */

import browser from 'webextension-polyfill';
import { loadFromLocalStorage, saveToLocalStorage } from '../localStorage/index.js';
import config from '../config.js';
import SDK from '../sdk/index.js';
import isContentScriptContext from './isContentScriptContext.js';
import { createRedactionStats, redactLogString, redactLogValue, redactionStatsToJSON } from './redactKeyMaterial.js';
import safeConsole from './safeConsole.js';

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
 * Coerces a log message to text without ever throwing: a null-prototype object
 * has no toString, and storeLog is called from catch blocks everywhere.
 * @param {*} value - The message candidate.
 * @return {string} The text.
 */
const toLogText = value => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return String(value);
  } catch {
    return 'Unknown Error';
  }
};

/**
 * Returns a string for a string, '' for anything else, so the message filters
 * never call `includes` on a non-string.
 * @param {*} value - The candidate.
 * @return {string} The value or ''.
 */
const stringOrEmpty = value => (typeof value === 'string' ? value : '');

/**
 * Recursively redacts key material and masks every URL found within a value
 * before it is sent to the backend. Strings are redacted first (a key glued to
 * a URL would otherwise be swallowed by the URL match and cut apart by the
 * masking), then their embedded URLs are replaced via {@link logURL}. CryptoKey
 * handles and binary data become markers before any traversal; arrays, plain
 * objects and Error objects are traversed (Error message/stack are
 * non-enumerable, so they are extracted explicitly). Other primitives are
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
    return redactLogString(value).replace(URL_REGEX, match => logURL(match));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  // Type rules come before any traversal: a key handle or raw bytes are never walked.
  const tag = Object.prototype.toString.call(value);

  if ((typeof CryptoKey !== 'undefined' && value instanceof CryptoKey) || tag === '[object CryptoKey]') {
    return '[CryptoKey]';
  }

  if (ArrayBuffer.isView(value) || tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
    return `[binary:${value.byteLength}]`;
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
 * Stores error logs to the 2FAS backend. Key material in the message, the
 * error info and the url label is redacted right after they are extracted,
 * before any sink: the console, the filters, the debounce map and the backend.
 * `context.redactions` carries how many markers were written and of which kinds.
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

  // Redact before any sink. The console print stays ahead of the logging gate,
  // so developers keep (redacted) diagnostics with logging off.
  const redactions = createRedactionStats();
  m = redactLogString(toLogText(m), redactions);
  c.errorInfo = redactLogValue(c.errorInfo, redactions);
  const logLabel = typeof url === 'string' ? redactLogString(url, redactions) : '';

  safeConsole.error('storeLog', logID, logLabel, c.errorInfo);

  try {
    storage = await loadFromLocalStorage(['logging', 'extensionID', 'browserInfo']);
  } catch (err) {
    safeConsole.error(err);
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

  // String-guarded locals: a non-string field must never throw here, outside
  // any try. The message falls back to `m`, which still holds the text of an
  // error whose own `message` is not enumerable (and so did not survive the
  // redacting copy).
  const info = c.errorInfo;
  const msg = typeof info?.message === 'string' ? info.message : m;
  const statusText = stringOrEmpty(info?.statusText);
  const backendStatusText = stringOrEmpty(info?.backendStatusText);

  if (
    (msg.includes('FILE_ERROR_NO_SPACE')) ||
    (info?.status === 407) ||
    (info?.backendStatus === 407) ||
    (msg.includes('An unexpected error occurred')) ||
    (msg.includes('Refused to run the JavaScript URL')) ||
    (msg.includes('QuotaExceededError: storage.local API call exceeded its quota limitations')) ||
    (statusText.includes('Proxy Authentication Required')) ||
    (backendStatusText.includes('Proxy Authentication Required')) ||
    (msg.includes('Could not establish connection')) ||
    (msg.includes('Receiving end does not exist')) ||
    (msg.includes('Extension context invalidated')) ||
    (msg.includes('Invalid call to runtime.sendMessage')) ||
    (msg.includes('Tab not found')) ||
    (msg.includes('The message port closed before a response was received'))
  ) {
    storage = null;
    m = null;
    c = null;
    return false;
  }

  // Built from redacted text: markers carry kind and length only, so the key
  // stays stable across different keys and never holds key material.
  const errorMessage = msg || m;

  if (shouldDebounce(logID, errorMessage)) {
    storage = null;
    m = null;
    c = null;
    return false;
  }

  c.errorType = errObj?.constructor?.name || '';
  c.extensionVersion = config.ExtensionVersion;
  c.browserInfo = storage.browserInfo;
  c.url = logURL(logLabel);
  c.online = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : null;

  if (!logLabel.includes('http')) {
    if (typeof window !== 'undefined' && window?.location?.href) {
      try {
        c.frontUrl = logURL(redactLogString(window.location.href, redactions));
      } catch (e) {}
    }
  }

  c.redactions = redactionStatsToJSON(redactions);

  try {
    m = sanitizeLogValue(m);
    c.errorInfo = sanitizeLogValue(c.errorInfo);

    if (isContentScriptContext()) {
      // Proxy through the background worker: it signs the request (the
      // signing key lives in the extension-origin IndexedDB, unreachable
      // here) and the fetch runs from the extension origin instead of the
      // page's (no host CORS surprises). Fallback to a direct — unsigned —
      // call only when messaging itself fails.
      try {
        const response = await browser.runtime.sendMessage({ action: 'storeLogEvent', level, message: m, context: c });

        if (response?.status !== 'ok') {
          throw new Error(`storeLogEvent proxy failed: ${response?.status || 'no response'}`);
        }
      } catch (proxyErr) {
        await new SDK().storeLog(storage.extensionID, level, m, c);
      }
    } else {
      await new SDK().storeLog(storage.extensionID, level, m, c);
    }
  } catch (err) {
    safeConsole.error('Failed to send log:', err);
  } finally {
    storage = null;
    m = null;
    c = null;
  }
};

export default storeLog;
export { logURL, sanitizeLogValue, shouldDebounce };
