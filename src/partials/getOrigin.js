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
 * Safely extracts the origin from a URL (or origin) string.
 * Opaque or undeterminable origins (about:blank, data:, file:, …) return null,
 * so callers can fall back to other heuristics instead of comparing against
 * the literal string "null".
 *
 * @param {string} value - The URL or origin string to parse.
 * @return {string|null} The origin, or null when it can't be determined.
 */
const getOrigin = value => {
  try {
    const { origin } = new URL(value);
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
};

export default getOrigin;
