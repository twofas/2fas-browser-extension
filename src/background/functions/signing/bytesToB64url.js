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

/* global btoa */

/**
 * Encodes bytes as padded base64url (RFC 4648 §5 with '=' padding). The
 * signing backend decodes every signature-related value with Go's
 * base64.URLEncoding — the URL-safe alphabet ('-'/'_') WITH '=' padding;
 * RawURLEncoding (unpadded) values are rejected, so padding must be kept.
 *
 * @param {ArrayBuffer|Uint8Array} bytes - The bytes to encode.
 * @returns {string} Padded base64url string.
 */
const bytesToB64url = bytes => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const b64 = btoa(view.reduce((data, byte) => data + String.fromCharCode(byte), ''));

  return b64.replaceAll('+', '-').replaceAll('/', '_');
};

export default bytesToB64url;
