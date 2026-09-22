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

import { describe, it, expect, vi, afterEach } from 'vitest';
import browser from 'webextension-polyfill';
import createMenuItem from './createMenuItem.js';

// runtime.lastError the way a browser sets it: only for the duration of the
// create callback. Reads are counted, since reading it is what marks it handled.
const installCreate = errorMessage => {
  let current = null;
  let readsDuringCallback = 0;
  let inCallback = false;

  Object.defineProperty(browser.runtime, 'lastError', {
    configurable: true,
    get: () => {
      if (inCallback) {
        readsDuringCallback += 1;
      }

      return current;
    },
    set: value => { current = value; }
  });

  browser.contextMenus = {
    create: vi.fn((props, callback) => {
      setTimeout(() => {
        current = errorMessage ? { message: errorMessage } : null;
        inCallback = true;
        callback();
        inCallback = false;
        current = null;
      }, 0);

      return props.id;
    })
  };

  return { reads: () => readsDuringCallback };
};

afterEach(() => {
  delete browser.contextMenus;
  Object.defineProperty(browser.runtime, 'lastError', { configurable: true, writable: true, value: null });
});

describe('createMenuItem', () => {
  it('reads runtime.lastError in the callback and resolves false when the browser rejects the item', async () => {
    const created = installCreate('Invalid call to menus.create(). Identifier is already used.');

    expect(await createMenuItem({ id: 'twofas-context-menu' })).toBe(false);
    expect(created.reads() > 0).toBe(true);
  });

  it('resolves true once the browser created the item', async () => {
    installCreate(null);

    expect(await createMenuItem({ id: 'twofas-context-menu' })).toBe(true);
  });

  it('resolves false when create throws synchronously', async () => {
    browser.contextMenus = {
      create: vi.fn(() => {
        throw new Error('contextMenus unavailable');
      })
    };

    expect(await createMenuItem({ id: 'twofas-context-menu' })).toBe(false);
  });
});
