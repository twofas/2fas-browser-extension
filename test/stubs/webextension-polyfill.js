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
// under test talks to this faithful-enough fake of browser.storage.{local,session}
// and browser.alarms.

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// Builds an independent storage area (used for both `local` and `session`) so the
// two never share state, mirroring the real browser.
const createStorageArea = () => {
  let store = {};

  const area = {
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

  area.__reset = () => { store = {}; };

  return area;
};

const local = createStorageArea();
const session = createStorageArea();

// Minimal browser.alarms double: records created alarms by name so tests can assert
// create/clear without a real scheduler (the onAlarm event itself is not simulated).
let alarmStore = {};

const alarms = {
  create: async (name, info = {}) => {
    alarmStore[name] = info;
  },
  clear: async name => {
    const existed = Object.prototype.hasOwnProperty.call(alarmStore, name);
    delete alarmStore[name];
    return existed;
  },
  clearAll: async () => {
    alarmStore = {};
    return true;
  },
  get: async name => (alarmStore[name] ? { name, ...alarmStore[name] } : null),
  getAll: async () => Object.entries(alarmStore).map(([name, info]) => ({ name, ...info })),
  onAlarm: {
    addListener: () => {},
    removeListener: () => {}
  }
};

const makeEvent = () => ({ addListener: () => {}, removeListener: () => {} });

const browser = {
  storage: { local, session },
  alarms,
  runtime: {
    id: 'test-extension-id',
    lastError: null,
    getManifest: () => ({ version: '0.0.0-test' }),
    setUninstallURL: async () => {},
    sendMessage: async () => ({}),
    // Must look like a real extension URL: `getURL('')` returning '' made every
    // `url.startsWith(base)` guard (the storageReset / updateList sender check,
    // isContentScriptContext) vacuously true, so a test that did not stub this
    // would have passed a hostile web-page sender.
    getURL: (input = '') => `chrome-extension://test-extension-id/${String(input).replace(/^\/+/, '')}`
  },
  tabs: {
    get: async () => ({}),
    query: async () => [],
    create: async () => ({}),
    update: async () => ({}),
    sendMessage: async () => ({}),
    onRemoved: makeEvent(),
    onUpdated: makeEvent(),
    onActivated: makeEvent()
  },
  windows: {
    update: async () => ({})
  },
  extension: {
    isAllowedIncognitoAccess: async () => false
  },
  // Frame lookups default to an empty result; tests spy on / override this.
  webNavigation: {
    getFrame: async () => ({}),
    getAllFrames: async () => []
  },
  // Native notifications: record nothing by default; tests spy on this.
  notifications: {
    create: async () => 'notification-id'
  },
  i18n: { getMessage: () => '' }
};

const resetStorage = () => {
  local.__reset();
  session.__reset();
  alarmStore = {};
};

export { resetStorage as __resetStorage };
export default browser;
