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
 * Encodes one ECDSA signature component as a DER INTEGER: minimal length
 * (leading zero octets stripped), with a 0x00 prefix when the top bit is set
 * so the value stays non-negative.
 *
 * @param {Uint8Array} bytes - Big-endian unsigned component (r or s half).
 * @returns {number[]} DER INTEGER bytes (tag + length + content).
 */
const encodeDerInteger = bytes => {
  let start = 0;

  while (start < bytes.length - 1 && bytes[start] === 0x00) {
    start++;
  }

  const stripped = Array.from(bytes.slice(start));

  if (stripped[0] & 0x80) {
    stripped.unshift(0x00);
  }

  return [0x02, stripped.length, ...stripped];
};

/**
 * Converts a WebCrypto ECDSA signature (IEEE P1363: raw r||s, 64 bytes for
 * P-256) to the ASN.1 DER SEQUENCE form the backend verifies with Go's
 * ecdsa.VerifyASN1. For P-256 the DER content is at most 70 bytes, so
 * single-byte lengths always suffice.
 *
 * @param {ArrayBuffer|Uint8Array} signature - Raw r||s signature (even length).
 * @returns {Uint8Array} DER-encoded signature.
 */
const p1363ToDer = signature => {
  const raw = signature instanceof Uint8Array ? signature : new Uint8Array(signature);

  if (raw.length === 0 || raw.length % 2 !== 0) {
    throw new TypeError(`p1363ToDer: expected even-length r||s signature, got ${raw.length} bytes`);
  }

  const half = raw.length / 2;
  const r = encodeDerInteger(raw.slice(0, half));
  const s = encodeDerInteger(raw.slice(half));

  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
};

export default p1363ToDer;
