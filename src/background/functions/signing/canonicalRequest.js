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

/** Signature format version accepted by the backend (internal/common/signing). */
const SIGNATURE_VERSION = '1';

/**
 * Builds the canonical signing payload — it must match the backend's
 * buildPayload (internal/common/signing/signing.go) byte for byte:
 * seven `key:value` lines joined with '\n', NO trailing newline.
 *
 * The backend reconstructs `path` from Go's r.URL.Path, which is
 * percent-DECODED. All current endpoints use UUIDs and fixed segments, so
 * URL.pathname (which keeps percent-encoding) is identical — if a path
 * segment ever carries a percent-escaped character, it must be decoded
 * here before signing.
 *
 * The backend also re-formats `timestamp` through Go's time.RFC3339, which
 * has no fractional seconds — the caller must pass a seconds-precision
 * RFC3339 UTC string ("2026-01-01T12:00:00Z"), never Date.toISOString()
 * output with milliseconds.
 *
 * @param {Object} input
 * @param {string} input.method - HTTP method (uppercased here, as on the backend).
 * @param {string} input.path - Request path, no scheme/host/fragment.
 * @param {string} input.query - Raw query string without '?'; '' when absent.
 * @param {string} input.bodySha256 - Padded base64url SHA-256 of the exact body bytes.
 * @param {string} input.timestamp - RFC3339 UTC timestamp, seconds precision.
 * @param {string} input.nonce - Padded base64url random nonce.
 * @returns {string} The canonical payload to sign.
 */
const buildCanonicalRequest = ({ method, path, query, bodySha256, timestamp, nonce }) => {
  return [
    `v:${SIGNATURE_VERSION}`,
    `method:${String(method).toUpperCase()}`,
    `path:${path}`,
    `query:${query}`,
    `body_sha256:${bodySha256}`,
    `timestamp:${timestamp}`,
    `nonce:${nonce}`
  ].join('\n');
};

export default buildCanonicalRequest;
export { SIGNATURE_VERSION };
