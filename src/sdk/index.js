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

/* global fetch */

/**
 * SDK class for communicating with the 2FAS REST API.
 */
class SDK {
  REST_API_URL = process.env.API_URL;

  /**
   * Handles successful API responses.
   * @param {Response} res - The fetch response object
   * @returns {Promise<Object>} Parsed JSON response or rejection
   */
  onSuccess (res) {
    if (res.status >= 200 && res.status < 400) {
      try {
        return res.json();
      } catch (err) {
        return Promise.reject(err);
      }
    }

    // Wrong status code
    return Promise.reject(res);
  }

  /**
   * Handles API errors and formats error objects.
   * @param {Response} err - The error response object
   * @returns {Promise<never>} Rejected promise with formatted error
   */
  async onError (err) {
    const errObj = {};
    errObj.status = err.status;
    errObj.statusText = err.statusText;

    if (err.status >= 400 && err.status < 500) {
      try {
        errObj.content = await err.json();
      } catch (e) {
        errObj.content = err;
      }
    } else {
      errObj.content = err;
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
   * @returns {Promise<Object>} Promise resolving to the created extension data
   */
  createExtensionInstance (browserInfo) {
    return fetch(`${this.REST_API_URL}/browser_extensions`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(browserInfo)
    }).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Updates an existing browser extension instance.
   * @param {string} extID - The extension ID
   * @param {Object} browserInfo - Updated browser information
   * @returns {Promise<Object>} Promise resolving to the updated extension data
   */
  updateBrowserExtension (extID, browserInfo) {
    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'PUT',
      body: JSON.stringify(browserInfo)
    }).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Retrieves all paired mobile devices for an extension.
   * @param {string} extID - The extension ID
   * @returns {Promise<Object[]>} Promise resolving to array of paired devices
   */
  getAllPairedDevices (extID) {
    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/devices`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'GET'
    }).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Removes a paired device from the extension.
   * @param {string} extID - The extension ID
   * @param {string} deviceID - The device ID to remove
   * @returns {Promise<Object>} Promise resolving when device is removed
   */
  removePairedDevice (extID, deviceID) {
    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/devices/${deviceID}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    }).then(this.onSuccess).catch(this.onError);
  }

  /**
   * Requests a 2FA token from paired devices.
   * @param {string} extID - The extension ID
   * @param {string} domain - The domain requesting the token
   * @returns {Promise<Object>} Promise resolving to the request data
   */
  request2FAToken (extID, domain) {
    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/commands/request_2fa_token`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ domain })
    }).then(this.onSuccess).catch(this.onError);
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

    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/2fa_requests/${requestID}/commands/close_2fa_request`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(data)
    }).then(this.onSuccess).catch(this.ignoreError);
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

    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/commands/store_log`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ level, message, context: JSON.stringify(context) })
    }).then(this.onSuccess).catch(this.ignoreError);
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
