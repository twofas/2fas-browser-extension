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

// Golden interop tests against the backend's canonical test vectors
// (2fas-server internal/common/signing/golden). The fixtures and the private
// key below are copied from the server repository — if these tests fail, the
// extension and the backend no longer agree on the wire format.

import { describe, it, expect } from 'vitest';
import { createPrivateKey, createPublicKey, createHash, verify as nodeVerify } from 'node:crypto';

import buildCanonicalRequest from './canonicalRequest.js';
import signRequest from './signRequest.js';
import hashBody from './hashBody.js';
import b64urlToBytes from './b64urlToBytes.js';
import { HEADER_SIGNATURE, HEADER_SIGNATURE_NONCE, HEADER_SIGNATURE_TIMESTAMP, HEADER_BODY_SHA256, HEADER_SIGNATURE_VERSION } from './signingHeaderNames.js';

import deleteNoBody from './testdata/requests/delete_no_body.json';
import get from './testdata/requests/get.json';
import headNoBody from './testdata/requests/head_no_body.json';
import postWithBody from './testdata/requests/post_with_body.json';
import postWithBodyMinuteLater from './testdata/requests/post_with_body_minute_later.json';
import postWithDifferentNonce from './testdata/requests/post_with_different_nonce.json';
import postWithoutBody from './testdata/requests/post_without_body.json';
import putWithBody from './testdata/requests/put_with_body.json';
import unicodeBody from './testdata/requests/unicode_body.json';

const FIXTURES = [
  deleteNoBody,
  get,
  headNoBody,
  postWithBody,
  postWithBodyMinuteLater,
  postWithDifferentNonce,
  postWithoutBody,
  putWithBody,
  unicodeBody
];

// The golden signing key from the server's golden_test.go (test material only).
const GOLDEN_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgXx9Q+l7f5k+3GVGS
w8e/9xBcbmRD9ct0D3HFNfm4BJehRANCAAR6PkAbQJMm2yYl8eBILTDTxPjU/TjO
FpEf+E3UohwO/Bi2EMf0r5UwLZHLTr0aAS6JjenrZ810pTrieOtp7j39
-----END PRIVATE KEY-----`;

const goldenPrivate = createPrivateKey(GOLDEN_PRIVATE_KEY_PEM);
const goldenPublic = createPublicKey(goldenPrivate);

const payloadForFixture = fixture => buildCanonicalRequest({
  method: fixture.Method,
  path: fixture.Path,
  query: fixture.RawQuery,
  bodySha256: fixture.Headers['X-2fas-Body-Sha256'],
  timestamp: fixture.Headers['X-2fas-Signature-Timestamp'],
  nonce: fixture.Headers['X-2fas-Signature-Nonce']
});

describe('golden interop — canonical payload', () => {
  it.each(FIXTURES.map(f => [f.Name, f]))('%s: golden signature verifies over our canonical payload', (name, fixture) => {
    const payload = payloadForFixture(fixture);
    const signature = Buffer.from(b64urlToBytes(fixture.Headers['X-2fas-Signature']));

    expect(nodeVerify('sha256', Buffer.from(payload, 'utf8'), goldenPublic, signature)).toBe(true);
  });

  it.each(FIXTURES.map(f => [f.Name, f]))('%s: our body hash matches the golden header', async (name, fixture) => {
    expect(await hashBody(fixture.Body)).toBe(fixture.Headers['X-2fas-Body-Sha256']);
  });

  it('canonical payload has the exact 7-line shape, no trailing newline', () => {
    const payload = payloadForFixture(postWithBody);

    expect(payload).toBe([
      'v:1',
      'method:POST',
      'path:/api/browser-extensions/example',
      'query:a=1&b=2',
      'body_sha256:k6I5cakU5erL8KjSUVTNownDwccvu5kU1Hxg88toFYg=',
      'timestamp:2026-01-01T12:00:00Z',
      'nonce:Z29sZGVuLW5vbmNlLXBvc3Rfd2l0aF9ib2R5LXBhZCE='
    ].join('\n'));
    expect(payload.endsWith('\n')).toBe(false);
  });
});

describe('golden interop — full signer round-trip', () => {
  it.each(FIXTURES.map(f => [f.Name, f]))('%s: signRequest output verifies like the golden client', async (name, fixture) => {
    // Import the golden key into WebCrypto and run the real signer over the
    // fixture's request; verify the produced DER signature with node:crypto,
    // reconstructing the payload the way the backend does (from headers).
    const pkcs8 = goldenPrivate.export({ type: 'pkcs8', format: 'der' });
    const webCryptoKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    const url = `https://api.example.test${fixture.Path}${fixture.RawQuery ? `?${fixture.RawQuery}` : ''}`;
    const headers = await signRequest(fixture.Method, url, fixture.Body, { privateKey: webCryptoKey });

    expect(headers[HEADER_SIGNATURE_VERSION]).toBe('1');
    expect(headers[HEADER_BODY_SHA256]).toBe(fixture.Headers['X-2fas-Body-Sha256']);

    const payload = buildCanonicalRequest({
      method: fixture.Method,
      path: fixture.Path,
      query: fixture.RawQuery,
      bodySha256: headers[HEADER_BODY_SHA256],
      timestamp: headers[HEADER_SIGNATURE_TIMESTAMP],
      nonce: headers[HEADER_SIGNATURE_NONCE]
    });
    const signature = Buffer.from(b64urlToBytes(headers[HEADER_SIGNATURE]));

    expect(nodeVerify('sha256', Buffer.from(payload, 'utf8'), goldenPublic, signature)).toBe(true);

    // Go's base64.URLEncoding is strict about padding — every value we emit
    // must decode as PADDED base64url (length divisible by 4).
    expect(headers[HEADER_SIGNATURE].length % 4).toBe(0);
    expect(headers[HEADER_SIGNATURE_NONCE].length % 4).toBe(0);
    expect(headers[HEADER_BODY_SHA256].length % 4).toBe(0);
  });

  it('empty body hashes to the SHA-256 of zero bytes', async () => {
    const expected = createHash('sha256').update(Buffer.alloc(0)).digest('base64')
      .replaceAll('+', '-').replaceAll('/', '_');

    expect(await hashBody('')).toBe(expected);
    expect(await hashBody('')).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=');
    expect(await hashBody(undefined)).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=');
  });
});
