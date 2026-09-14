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

/* global crypto, TextEncoder, URL */
import buildCanonicalRequest, { SIGNATURE_VERSION } from './canonicalRequest.js';
import p1363ToDer from './p1363ToDer.js';
import bytesToB64url from './bytesToB64url.js';
import hashBody from './hashBody.js';
import toRFC3339Seconds from './toRFC3339Seconds.js';
import {
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_SIGNATURE_NONCE,
  HEADER_BODY_SHA256,
  HEADER_SIGNATURE
} from './signingHeaderNames.js';

/** Nonce size in bytes — matches the backend's own e2e client (24 random bytes). */
const NONCE_BYTES = 24;

/**
 * Signs one HTTP request for the 2FAS backend's browser-extension signing
 * middleware: builds the canonical payload from the request's method, path,
 * query, body hash, a fresh seconds-precision UTC timestamp and a fresh
 * random nonce, signs it with ECDSA P-256 / SHA-256, converts the raw
 * WebCrypto signature to ASN.1 DER, and returns the five signature headers.
 *
 * Each call produces a fresh nonce and timestamp — a retried request MUST be
 * re-signed (the backend stores used nonces and rejects replays).
 *
 * @async
 * @param {string} method - HTTP method.
 * @param {string} url - Absolute request URL.
 * @param {string} [body=''] - The exact string sent as the request body ('' for none).
 * @param {Object} options
 * @param {CryptoKey} options.privateKey - ECDSA P-256 private key with 'sign' usage.
 * @param {number} [options.clockOffsetMs=0] - Correction added to the local clock
 *   (server time minus local time), keeping the timestamp inside the backend's
 *   ±5 min window on machines with a skewed clock.
 * @param {number} [options.nowMs] - Epoch ms override for tests.
 * @returns {Promise<Object>} The signature headers to merge into the request.
 */
const signRequest = async (method, url, body = '', { privateKey, clockOffsetMs = 0, nowMs } = {}) => {
  if (!privateKey) {
    throw new TypeError('signRequest: missing private key');
  }

  const parsed = new URL(url);
  // The backend signs over Go's r.URL.Path, which is percent-DECODED, while
  // URL.pathname keeps percent-encoding. All current endpoints are UUIDs +
  // fixed segments (identical either way); decode defensively so a future
  // escaped path segment cannot silently break verification.
  let path = parsed.pathname;

  if (path.includes('%')) {
    try {
      path = decodeURIComponent(path);
    } catch (e) {
      // Malformed escape — keep the raw form rather than failing the request.
    }
  }

  const timestamp = toRFC3339Seconds((typeof nowMs === 'number' ? nowMs : Date.now()) + clockOffsetMs);
  const nonce = bytesToB64url(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
  const bodySha256 = await hashBody(body);

  const payload = buildCanonicalRequest({
    method,
    path,
    query: parsed.search.startsWith('?') ? parsed.search.slice(1) : parsed.search,
    bodySha256,
    timestamp,
    nonce
  });

  const rawSignature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    new TextEncoder().encode(payload)
  );

  return {
    [HEADER_SIGNATURE_VERSION]: SIGNATURE_VERSION,
    [HEADER_SIGNATURE_TIMESTAMP]: timestamp,
    [HEADER_SIGNATURE_NONCE]: nonce,
    [HEADER_BODY_SHA256]: bodySha256,
    [HEADER_SIGNATURE]: bytesToB64url(p1363ToDer(rawSignature))
  };
};

export default signRequest;
export { NONCE_BYTES };
