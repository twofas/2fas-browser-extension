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

/* global Buffer */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verify as nodeVerify, createPublicKey } from 'node:crypto';

vi.mock('@partials/storeLog.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import getWebSocketProtocols, { encodeWebSocketSigningProtocols, WS_SIGNING_PROTOCOL } from './getWebSocketProtocols.js';
import { generateSigningKeyMaterial } from './signingKeyStore.js';
import buildCanonicalRequest from './canonicalRequest.js';
import b64urlToBytes from './b64urlToBytes.js';
import {
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_SIGNATURE_NONCE,
  HEADER_BODY_SHA256,
  HEADER_SIGNATURE
} from './signingHeaderNames.js';
import { saveToLocalStorage } from '@localStorage/index.js';
import { saveToSessionStorage } from '@sessionStorage/index.js';
import { CLOCK_OBSERVED_KEY } from './clockOffset.js';

const WS_URL = 'wss://ws.example.test/browser_extensions/11111111-2222-4333-8444-555555555555/2fa_requests/66666666-7777-4888-9999-000000000000';

// The backend's WSSigningPayload member names (encoding/json/v2, case-sensitive).
const SERVER_FIELDS = [
  'X-2fas-Signature-Version',
  'X-2fas-Signature-Timestamp',
  'X-2fas-Signature-Nonce',
  'X-2fas-Body-Sha256',
  'X-2fas-Signature'
];

// A subprotocol must be an RFC 7230 token; base64url without padding is.
const TOKEN = /^[A-Za-z0-9_-]+$/;

// Go's base64.URLEncoding (padded) only decodes a length that is a multiple of 4.
const decodesWithPaddedDecoder = value => value.length % 4 === 0 && TOKEN.test(value);

const decodePayload = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const syntheticHeaders = signatureLength => ({
  [HEADER_SIGNATURE_VERSION]: '1',
  [HEADER_SIGNATURE_TIMESTAMP]: '2026-09-22T10:00:00Z',
  [HEADER_SIGNATURE_NONCE]: 'A'.repeat(32),
  [HEADER_BODY_SHA256]: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=',
  [HEADER_SIGNATURE]: `${'B'.repeat(signatureLength - 1)}=`
});

beforeEach(async () => {
  vi.clearAllMocks();
  await saveToSessionStorage({ [CLOCK_OBSERVED_KEY]: Date.now() });
});

describe('encodeWebSocketSigningProtocols', () => {
  it('puts the 2FAS marker first and the payload right after it', () => {
    const protocols = encodeWebSocketSigningProtocols(syntheticHeaders(96));

    expect(protocols.length).toBe(2);
    expect(protocols[0]).toBe('2FAS');
    expect(WS_SIGNING_PROTOCOL).toBe('2FAS');
  });

  it('uses exactly the backend member names, whatever the header casing', () => {
    const payload = decodePayload(encodeWebSocketSigningProtocols(syntheticHeaders(96))[1]);

    expect(Object.keys(payload)).toEqual(SERVER_FIELDS);
    expect(payload['X-2fas-Signature-Version']).toBe('1');
    expect(payload['X-2fas-Signature-Timestamp']).toBe('2026-09-22T10:00:00Z');
    expect(payload['X-2fas-Body-Sha256']).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=');
  });

  // Every base64url length a DER P-256 signature can take (DER 72..66 bytes).
  it.each([96, 92, 88])('stays a valid token that a padded decoder accepts for a %i-char signature', length => {
    const [, value] = encodeWebSocketSigningProtocols(syntheticHeaders(length));

    expect(TOKEN.test(value)).toBe(true);
    expect(decodesWithPaddedDecoder(value)).toBe(true);
    expect(decodePayload(value)['X-2fas-Signature'].length).toBe(length);
  });
});

describe('getWebSocketProtocols', () => {
  it('returns null while signing is inactive: the handshake goes unsigned', async () => {
    await saveToLocalStorage({ signing: { active: false, conflict: false } });

    expect(await getWebSocketProtocols(WS_URL)).toBe(null);
  });

  it('returns null in the conflict state', async () => {
    await generateSigningKeyMaterial();
    await saveToLocalStorage({ signing: { active: true, conflict: true } });

    expect(await getWebSocketProtocols(WS_URL)).toBe(null);
  });

  it('signs GET <ws path> with an empty body, verifiable with the registered key', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: true, conflict: false }
    });

    const protocols = await getWebSocketProtocols(WS_URL);

    expect(protocols?.[0]).toBe('2FAS');
    expect(decodesWithPaddedDecoder(protocols[1])).toBe(true);

    const payload = decodePayload(protocols[1]);
    expect(Object.keys(payload)).toEqual(SERVER_FIELDS);
    expect(payload['X-2fas-Body-Sha256']).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=');
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload['X-2fas-Signature-Timestamp'])).toBe(true);

    const canonical = buildCanonicalRequest({
      method: 'GET',
      path: new URL(WS_URL).pathname,
      query: '',
      bodySha256: payload['X-2fas-Body-Sha256'],
      timestamp: payload['X-2fas-Signature-Timestamp'],
      nonce: payload['X-2fas-Signature-Nonce']
    });
    const publicKey = createPublicKey({ key: Buffer.from(material.signingPublicKey, 'base64'), format: 'der', type: 'spki' });
    const signature = Buffer.from(b64urlToBytes(payload['X-2fas-Signature']));
    const verified = nodeVerify('sha256', Buffer.from(canonical, 'utf8'), publicKey, signature);

    expect(verified).toBe(true);
  });

  it('signs afresh on every call: the backend nonce is single-use', async () => {
    const material = await generateSigningKeyMaterial();
    await saveToLocalStorage({
      keys: { publicKey: 'rsa-pub', signingPublicKey: material.signingPublicKey },
      signing: { active: true, conflict: false }
    });

    const first = decodePayload((await getWebSocketProtocols(WS_URL))[1]);
    const second = decodePayload((await getWebSocketProtocols(WS_URL))[1]);

    expect(first['X-2fas-Signature-Nonce'] === second['X-2fas-Signature-Nonce']).toBe(false);
  });
});
