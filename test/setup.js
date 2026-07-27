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

import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import { __resetStorage } from './stubs/webextension-polyfill.js';

// Node exposes Web Crypto as globalThis.crypto from v20; guard for safety.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Give every test a clean IndexedDB and a clean storage.local.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetStorage();
});
