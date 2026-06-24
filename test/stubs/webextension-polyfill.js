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

// In-memory test double for the `browser` object from webextension-polyfill.
// Vitest aliases 'webextension-polyfill' to this file, so all extension code
// under test talks to this faithful-enough fake of browser.storage.local.

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

let store = {};

const local = {
  get: async keys => {
    if (keys === null || keys === undefined) {
      return clone(store);
    }

    if (typeof keys === 'string') {
      return store[keys] === undefined ? {} : { [keys]: clone(store[keys]) };
    }

    if (Array.isArray(keys)) {
      const out = {};
      keys.forEach(key => {
        if (store[key] !== undefined) {
          out[key] = clone(store[key]);
        }
      });
      return out;
    }

    // Object form: keys are defaults, returned when not present in storage.
    const out = {};
    Object.keys(keys).forEach(key => {
      out[key] = store[key] === undefined ? keys[key] : clone(store[key]);
    });
    return out;
  },
  set: async data => {
    Object.keys(data).forEach(key => {
      store[key] = clone(data[key]);
    });
  },
  remove: async keys => {
    (Array.isArray(keys) ? keys : [keys]).forEach(key => {
      delete store[key];
    });
  },
  clear: async () => {
    store = {};
  }
};

const browser = {
  storage: { local },
  runtime: {
    lastError: null,
    getManifest: () => ({ version: '0.0.0-test' }),
    setUninstallURL: async () => {},
    sendMessage: async () => ({}),
    getURL: input => input
  },
  tabs: {
    get: async () => ({}),
    sendMessage: async () => ({})
  },
  i18n: { getMessage: () => '' }
};

const resetStorage = () => { store = {}; };

export { resetStorage as __resetStorage };
export default browser;
