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

const neostandard = require('neostandard');

module.exports = [
  ...neostandard({
    semi: true,
    noJsx: true,
    env: ['browser', 'webextensions', 'node'],
    ignores: [
      'public/**',
      'build/**',
      'node_modules/**',
      '.yarn/**'
    ]
  }),
  {
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022
    },
    rules: {
      'no-tabs': 'off',
      indent: ['warn', 2, { SwitchCase: 1 }],
      'no-useless-escape': 'off',
      'no-trailing-spaces': ['error', { skipBlankLines: true }],
      'no-irregular-whitespace': 'off'
    }
  },
  {
    // Key-adjacent modules print through @partials/safeConsole.js, which redacts
    // key material from every argument. A raw console call there could echo a
    // key carried by a backend Reason, a request body or an error object.
    files: [
      'src/background/functions/signing/**/*.js',
      'src/background/functions/update/**/*.js',
      'src/sdk/**/*.js',
      'src/partials/storeLog.js',
      'src/background/functions/subscribeChannel.js',
      'src/background/functions/selfHealMissingPrivateKey.js',
      'src/background/functions/syncDevicesWithAPI.js',
      'src/background/functions/keyStore.js',
      'src/background/functions/cryptoKeyStore.js',
      'src/background/functions/privateKeyStore.js',
      'src/background/functions/generateDefaultStorage.js',
      // The storeLogEvent proxy: its failure path prints the SDK rejection,
      // whose body can echo what the request carried.
      'src/background/events/onMessage.js'
    ],
    ignores: ['**/*.test.js'],
    rules: {
      'no-console': 'error'
    }
  }
];
