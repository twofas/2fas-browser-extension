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

/* global TextEncoder */
import bytesToB64url from './bytesToB64url.js';
import getSigningHeaders from './getSigningHeaders.js';
import {
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_SIGNATURE_NONCE,
  HEADER_BODY_SHA256,
  HEADER_SIGNATURE
} from './signingHeaderNames.js';

/** Marker subprotocol: the backend reads the signature from the protocol right after it. */
const WS_SIGNING_PROTOCOL = '2FAS';

// Member names of the backend's WSSigningPayload. Go's encoding/json/v2 matches
// them case-sensitively and rejects unknown members, so the header constants
// (X-2FAS-…, fine for case-insensitive HTTP headers) cannot be reused as keys.
const WS_PAYLOAD_FIELDS = [
  ['X-2fas-Signature-Version', HEADER_SIGNATURE_VERSION],
  ['X-2fas-Signature-Timestamp', HEADER_SIGNATURE_TIMESTAMP],
  ['X-2fas-Signature-Nonce', HEADER_SIGNATURE_NONCE],
  ['X-2fas-Body-Sha256', HEADER_BODY_SHA256],
  ['X-2fas-Signature', HEADER_SIGNATURE]
];

/**
 * Packs the five signature headers into WebSocket subprotocols: the '2FAS'
 * marker followed by the base64url JSON payload — the only request metadata a
 * browser WebSocket can set.
 *
 * A subprotocol must be an HTTP token, so the payload cannot carry '='
 * padding, while the backend decodes it with padded base64.URLEncoding. The
 * JSON is padded with trailing whitespace to a multiple of 3 bytes, where the
 * padded and unpadded encodings are the same string. Without it, a shorter DER
 * signature (about 1 in 500) would make the backend reject the handshake.
 *
 * @param {Object} headers - The headers returned by signRequest.
 * @returns {string[]} `['2FAS', <payload>]`.
 */
const encodeWebSocketSigningProtocols = headers => {
  const payload = Object.fromEntries(WS_PAYLOAD_FIELDS.map(([field, header]) => [field, headers[header]]));
  const json = JSON.stringify(payload);
  const padding = (3 - (new TextEncoder().encode(json).length % 3)) % 3;

  return [WS_SIGNING_PROTOCOL, bytesToB64url(new TextEncoder().encode(json + ' '.repeat(padding)))];
};

/**
 * Signs a WebSocket handshake (GET <ws path>, empty body) for the backend's
 * signing middleware. The same rules as for SDK requests decide whether it is
 * signed (see getSigningHeaders); a failed signature goes out unsigned.
 *
 * Each call signs afresh: the nonce is single-use, so every connect and
 * reconnect needs its own call.
 *
 * @async
 * @param {string} url - Absolute WebSocket URL (wss://…).
 * @returns {Promise<string[]|null>} Subprotocols for `new WebSocket(url, protocols)`,
 *   or null for an unsigned handshake.
 */
const getWebSocketProtocols = async url => {
  const headers = await getSigningHeaders('GET', url, '');

  if (!headers?.[HEADER_SIGNATURE]) {
    return null;
  }

  return encodeWebSocketSigningProtocols(headers);
};

export default getWebSocketProtocols;
export { encodeWebSocketSigningProtocols, WS_SIGNING_PROTOCOL };
