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

const inputsSelectors = () => {
  const inputSelectors = [
    ':not(read-only)',
    ':not(readonly)',
    ':not([read-only])',
    ':not([readonly])',
    ':not(list)',
    ':not(-moz-read-only)',
    ':not(disabled)',
    ':not([disabled])',
    ':not([role="button"])',
    ':not([role="submit"])'
  ].join('');

  // ONLY DETAILED
  const passwordSelectors = [
    'input[type="password"]#security-code'
  ].join(',');

  const textAreaSelectors = [
    ':not([type="hidden"])',
    ':not(read-only)',
    ':not(readonly)',
    ':not([read-only])',
    ':not([readonly])',
    ':not(-moz-read-only)',
    ':not(disabled)',
    ':not([disabled])'
  ].join('');

  return `input[type="text"]${inputSelectors},input[type="number"]${inputSelectors},input[type="tel"]${inputSelectors},input:not([type])${inputSelectors},${passwordSelectors},textarea${textAreaSelectors}`;
};

module.exports = inputsSelectors;
