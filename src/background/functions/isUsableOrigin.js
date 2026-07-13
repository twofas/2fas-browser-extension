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
 * Whether an origin is a usable, comparable identity. Opaque origins
 * (`data:`, `about:srcdoc`, sandboxed frames) all stringify to the literal
 * "null", so two *different* opaque documents would compare equal — they must
 * never be treated as a match for token delivery.
 *
 * @param {*} origin - The origin string from `new URL(url).origin`.
 * @returns {boolean} True when the origin uniquely identifies a real origin.
 */
const isUsableOrigin = origin => typeof origin === 'string' && origin.length > 0 && origin !== 'null';

export default isUsableOrigin;
