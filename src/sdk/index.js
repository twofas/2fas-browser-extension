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

/* global fetch, AbortController, Response, setTimeout, clearTimeout */

/**
 * Hard per-request timeout (ms) for the runtime SDK calls (token flow, device
 * list, log upload). A hung connection must reject deterministically instead of
 * keeping a promise — and the MV3 service worker — alive indefinitely.
 * Aligned with REGISTRATION_TIMEOUT_MS used by the durable-registration flow.
 */
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Backoff delays (ms) between retries of the idempotent GET getAllPairedDevices.
 * Its length is the retry count (2 retries → at most 3 attempts).
 */
const PAIRED_DEVICES_RETRY_BACKOFF_MS = [1000, 2000];

/**
 * SDK class for communicating with the 2FAS REST API.
 */
class SDK {
  REST_API_URL = process.env.API_URL;

  /**
   * Performs a fetch with an optional hard timeout.
   * When `timeoutMs` is falsy the call behaves exactly like a bare fetch (no
   * AbortController), preserving the original behaviour for user-initiated calls.
   * When set, a hung connection is aborted so the promise rejects deterministically
   * (surfaced as an AbortError, classified as a transient network failure).
   *
   * @param {string} url - The request URL.
   * @param {Object} options - fetch() options.
   * @param {number} [timeoutMs] - Abort the request after this many milliseconds.
   * @returns {Promise<Response>}
   */
  fetchWithTimeout (url, options, timeoutMs) {
    if (!timeoutMs) {
      return fetch(url, options);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  /**
   * Whether a raw fetch rejection is worth retrying for an idempotent request.
   * Network/abort errors (rejection is an Error, no Response) are transient; among
   * HTTP errors (rejection is the Response, from onSuccess) only 408/425/429/5xx are.
   * Everything else (404 and other deterministic 4xx) must fail fast.
   *
   * @param {Response|Error} err - The raw rejection.
   * @returns {boolean}
   */
  isRetryableError (err) {
    if (err instanceof Response) {
      const { status } = err;
      return status === 408 || status === 425 || status === 429 || status >= 500;
    }

    return true;
  }

  /**
   * Performs a request with a hard timeout and bounded retries on transient
   * failures (network/abort errors and retryable server statuses), pausing for
   * the supplied backoff delay before each retry. Exhausted retries and
   * non-retryable rejections are normalized through onError.
   * Use ONLY for idempotent requests (GET) — a retried POST could double-act.
   *
   * @param {string} url - The request URL.
   * @param {Object} options - fetch() options.
   * @param {Object} [settings] - Retry settings.
   * @param {number} [settings.timeoutMs] - Per-attempt timeout.
   * @param {number[]} [settings.backoffMs] - Delay before each retry; its length is the retry count.
   * @returns {Promise<Object>}
   */
  fetchWithRetry (url, options, { timeoutMs, backoffMs = [] } = {}) {
    const attempt = i => this.fetchWithTimeout(url, options, timeoutMs)
      .then(this.onSuccess)
      .catch(err => {
        if (i < backoffMs.length && this.isRetryableError(err)) {
          return new Promise(resolve => setTimeout(resolve, backoffMs[i]))
            .then(() => attempt(i + 1));
        }

        return this.onError(err);
      });

    return attempt(0);
  }

  /**
   * Handles successful API responses.
   * @param {Response} res - The fetch response object
   * @returns {Promise<Object>} Parsed JSON response or rejection
   */
  onSuccess (res) {
    if (res.status < 200 || res.status >= 400) {
      return Promise.reject(res);
    }

    if (res.status === 204) {
      return Promise.resolve({});
    }

    return res.text().then(text => {
      if (!text) {
        return {};
      }

      try {
        return JSON.parse(text);
      } catch (e) {
        return Promise.reject(new SyntaxError(`Invalid JSON response: ${e.message}`));
      }
    });
  }

  /**
   * Handles API errors and formats error objects.
   * Extracts as much useful information as possible from either:
   *   - a Response (HTTP error) — status, statusText, body (json or text)
   *   - a network/parse Error — name, message, stack
   * @param {Response|Error} err - The error to format
   * @returns {Promise<never>} Rejected promise with formatted error
   */
  async onError (err) {
    const errObj = {};

    if (err instanceof Response) {
      errObj.status = err.status;
      errObj.statusText = err.statusText;
      errObj.url = err.url;

      try {
        const text = await err.text();

        if (!text) {
          errObj.content = '';
        } else {
          try {
            errObj.content = JSON.parse(text);
          } catch (e) {
            errObj.content = text;
          }
        }
      } catch (e) {
        errObj.content = '';
        errObj.bodyReadError = e?.message || String(e);
      }

      return Promise.reject(errObj);
    }

    errObj.name = err?.name || 'Error';
    errObj.message = err?.message || String(err);

    if (err?.stack) {
      errObj.stack = err.stack;
    }

    if (err?.cause) {
      errObj.cause = String(err.cause);
    }

    return Promise.reject(errObj);
  }

  /**
   * Ignores errors and resolves the promise.
   * @returns {Promise<void>} Resolved promise
   */
  ignoreError () {
    return Promise.resolve();
  }

  /**
   * Creates a new browser extension instance on the server.
   * @param {Object} browserInfo - Browser information object
   * @param {Object} [options] - Optional settings.
   * @param {number} [options.timeoutMs] - Abort the request after this many milliseconds.
   * @returns {Promise<Object>} Promise resolving to the created extension data
   */
  createExtensionInstance (browserInfo, { timeoutMs } = {}) {
    return this.fetchWithTimeout(`${this.REST_API_URL}/browser_extensions`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(browserInfo)
    }, timeoutMs).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Updates an existing browser extension instance.
   * Server requires extension_id to be a valid UUID4 and name to be non-blank.
   * @param {string} extID - The extension ID (must be a UUID4)
   * @param {Object} browserInfo - Updated browser information ({ name, browser_name, browser_version })
   * @param {Object} [options] - Optional settings.
   * @param {number} [options.timeoutMs] - Abort the request after this many milliseconds.
   * @returns {Promise<Object>} Promise resolving to the updated extension data
   */
  updateBrowserExtension (extID, browserInfo, { timeoutMs } = {}) {
    if (!extID || typeof extID !== 'string') {
      return Promise.reject(new Error('updateBrowserExtension: missing or invalid extID'));
    }

    if (!browserInfo || typeof browserInfo !== 'object') {
      return Promise.reject(new Error('updateBrowserExtension: missing or invalid browserInfo'));
    }

    if (!browserInfo.name || typeof browserInfo.name !== 'string' || browserInfo.name.trim() === '') {
      return Promise.reject(new Error('updateBrowserExtension: name is required and must be non-blank'));
    }

    return this.fetchWithTimeout(`${this.REST_API_URL}/browser_extensions/${extID}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'PUT',
      body: JSON.stringify(browserInfo)
    }, timeoutMs).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Retrieves all paired mobile devices for an extension.
   * @param {string} extID - The extension ID
   * @returns {Promise<Object[]>} Promise resolving to array of paired devices
   */
  getAllPairedDevices (extID) {
    return this.fetchWithRetry(`${this.REST_API_URL}/browser_extensions/${extID}/devices`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'GET'
    }, { timeoutMs: DEFAULT_TIMEOUT_MS, backoffMs: PAIRED_DEVICES_RETRY_BACKOFF_MS });
  }

  /**
   * Removes a paired device from the extension.
   * @param {string} extID - The extension ID
   * @param {string} deviceID - The device ID to remove
   * @returns {Promise<Object>} Promise resolving when device is removed
   */
  removePairedDevice (extID, deviceID) {
    return this.fetchWithTimeout(`${this.REST_API_URL}/browser_extensions/${extID}/devices/${deviceID}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    }, DEFAULT_TIMEOUT_MS).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Requests a 2FA token from paired devices.
   * @param {string} extID - The extension ID
   * @param {string} domain - The domain requesting the token
   * @returns {Promise<Object>} Promise resolving to the request data
   */
  request2FAToken (extID, domain) {
    return this.fetchWithTimeout(`${this.REST_API_URL}/browser_extensions/${extID}/commands/request_2fa_token`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ domain })
    }, DEFAULT_TIMEOUT_MS).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Closes a 2FA token request.
   * @param {string} extID - The extension ID
   * @param {string} requestID - The request ID to close
   * @param {boolean} [status=true] - True for completed, false for terminated
   * @returns {Promise<Object>} Promise resolving when request is closed
   */
  close2FARequest (extID, requestID, status = true) {
    const data = { status: status ? 'completed' : 'terminated' };

    return this.fetchWithTimeout(`${this.REST_API_URL}/browser_extensions/${extID}/2fa_requests/${requestID}/commands/close_2fa_request`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(data)
    }, DEFAULT_TIMEOUT_MS).then(this.onSuccess).catch(this.ignoreError);
  }

  /**
   * Stores a log entry on the server.
   * @param {string} extID - The extension ID
   * @param {string} level - Log level (info, warning, error, debug)
   * @param {string} message - The log message
   * @param {Object} context - Additional context data
   * @returns {Promise<Object>} Promise resolving when log is stored
   */
  storeLog (extID, level, message, context) {
    const levels = ['info', 'warning', 'error', 'debug'];

    if (!level || !levels.includes(level)) {
      return Promise.reject(new Error('Invalid log level'));
    }

    return this.fetchWithTimeout(`${this.REST_API_URL}/browser_extensions/${extID}/commands/store_log`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ level, message, context: JSON.stringify(context) })
    }, DEFAULT_TIMEOUT_MS).then(this.onSuccess).catch(this.ignoreError);
  }

  /**
   * Generates a QR code link for device pairing.
   * @param {string} browserExtID - The browser extension ID
   * @returns {string} The QR code link URL
   */
  generateQRLink (browserExtID) {
    return `twofas_c://${browserExtID}`;
  }
}

export default SDK;
