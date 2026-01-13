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

/* global fetch */
class SDK {
  REST_API_URL = process.env.API_URL;

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

  ignoreError () {
    return Promise.resolve();
  }

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

  getAllPairedDevices (extID) {
    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/devices`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'GET'
    }).then(this.onSuccess).catch(this.onError);
  }

  removePairedDevice (extID, deviceID) {
    return fetch(`${this.REST_API_URL}/browser_extensions/${extID}/devices/${deviceID}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    }).then(this.onSuccess).catch(this.onError);
  }

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

  generateQRLink (browserExtID) {
    return `twofas_c://${browserExtID}`;
  }
}

export default SDK;
