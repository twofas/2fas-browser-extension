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

/**
 * Extracts browser version from user agent string using regex.
 * @param {string} userAgent - The user agent string to parse.
 * @param {RegExp} regex - The regular expression to match the version.
 * @returns {string} The browser version or '0.0.0.0' if not found.
 */
const getBrowserVersion = (userAgent, regex) => {
  if (!userAgent || !regex) {
    return '0.0.0.0';
  }

  const match = userAgent.match(regex);

  return match ? match[2] : '0.0.0.0';
};

export default getBrowserVersion;
