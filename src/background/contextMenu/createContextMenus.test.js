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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import browser from 'webextension-polyfill';
import createContextMenus from './createContextMenus.js';
import { saveToLocalStorage } from '@localStorage/index.js';

// A browser-like contextMenus: both calls complete asynchronously, a create with an
// id that is already registered fails ("Identifier is already used") and sets
// runtime.lastError for the duration of its callback, as the real API does.
const installFakeMenus = () => {
  const items = new Map();
  const duplicates = [];

  browser.contextMenus = {
    removeAll: vi.fn(() => new Promise(resolve => setTimeout(() => {
      items.clear();
      resolve();
    }, 0))),
    create: vi.fn((props, callback) => {
      setTimeout(() => {
        if (items.has(props.id)) {
          duplicates.push(props.id);
          browser.runtime.lastError = { message: 'Invalid call to menus.create(). Identifier is already used.' };
        } else {
          items.set(props.id, props);
        }

        callback?.();
        browser.runtime.lastError = null;
      }, 0);

      return props.id;
    })
  };

  return { items, duplicates };
};

// Lets any create still in flight land, so a duplicate cannot hide behind timing.
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

beforeEach(() => {
  browser.runtime.lastError = null;
});

afterEach(() => {
  delete browser.contextMenus;
  vi.unstubAllEnvs();
});

describe('createContextMenus', () => {
  it('builds the menu once when two callers overlap (background load + onStartup)', async () => {
    const { items, duplicates } = installFakeMenus();

    await Promise.all([createContextMenus(), createContextMenus()]);
    await settle();

    expect(duplicates).toEqual([]);
    expect(items.has('twofas-context-menu')).toBe(true);
  });

  it('rebuilds instead of duplicating when called again later', async () => {
    const { items, duplicates } = installFakeMenus();

    await createContextMenus();
    await settle();
    await createContextMenus();
    await settle();

    expect(duplicates).toEqual([]);
    expect(items.size).toBe(1);
  });

  it('checks runtime.lastError, so a failed create is never reported as unchecked', async () => {
    installFakeMenus();

    await createContextMenus();

    expect(typeof browser.contextMenus.create.mock.calls[0][1]).toBe('function');
  });

  it('creates no menu item when the user turned the context menu off', async () => {
    await saveToLocalStorage({ contextMenu: false });
    const { items } = installFakeMenus();

    await createContextMenus();

    expect(items.has('twofas-context-menu')).toBe(false);
  });

  it('keeps the Firefox options menu single across overlapping calls', async () => {
    vi.stubEnv('EXT_PLATFORM', 'Firefox');
    await saveToLocalStorage({ contextMenu: false });
    const { items, duplicates } = installFakeMenus();

    await Promise.all([createContextMenus(), createContextMenus()]);
    await settle();

    expect(duplicates).toEqual([]);
    expect(items.has('twofas-firefox-options-menu')).toBe(true);
  });
});
