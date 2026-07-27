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

import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const aliases = require('./webpack/utils/aliases.js');
const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: [path.resolve(dirname, 'test/setup.js')],
    env: {
      EXT_PLATFORM: 'Chrome',
      API_URL: 'https://api.example.test',
      WS_URL: 'wss://ws.example.test'
    }
  },
  resolve: {
    alias: {
      ...aliases,
      // Replace the real polyfill (which throws outside a browser) with an
      // in-memory fake of browser.storage.local.
      'webextension-polyfill': path.resolve(dirname, 'test/stubs/webextension-polyfill.js')
    }
  }
});
