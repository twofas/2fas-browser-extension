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
  }
];
