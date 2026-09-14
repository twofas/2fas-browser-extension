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

/* global crypto, TextEncoder */
import bytesToB64url from './bytesToB64url.js';

/**
 * Computes the padded-base64url SHA-256 of the exact request body bytes
 * (UTF-8). An absent body hashes as zero bytes — the backend does the same.
 *
 * @async
 * @param {string} [body=''] - The exact string passed as the fetch body.
 * @returns {Promise<string>} Padded base64url digest.
 */
const hashBody = async (body = '') => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body || ''));

  return bytesToB64url(digest);
};

export default hashBody;
