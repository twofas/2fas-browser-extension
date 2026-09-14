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

/* global crypto */
import { describe, it, expect, beforeAll } from 'vitest';

import signRequest from './signRequest.js';
import toRFC3339Seconds from './toRFC3339Seconds.js';
import b64urlToBytes from './b64urlToBytes.js';
import bytesToB64url from './bytesToB64url.js';
import {
  HEADER_SIGNATURE_VERSION,
  HEADER_SIGNATURE_TIMESTAMP,
  HEADER_SIGNATURE_NONCE,
  HEADER_BODY_SHA256,
  HEADER_SIGNATURE
} from './signingHeaderNames.js';

let privateKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  privateKey = pair.privateKey;
});

describe('toRFC3339Seconds', () => {
  it('emits seconds precision with Z — the backend re-formats through time.RFC3339, so milliseconds would break the signature', () => {
    expect(toRFC3339Seconds(Date.UTC(2026, 0, 1, 12, 0, 0, 123))).toBe('2026-01-01T12:00:00Z');
    expect(toRFC3339Seconds(Date.UTC(2026, 0, 1, 12, 0, 0, 0))).toBe('2026-01-01T12:00:00Z');
  });
});

describe('signRequest', () => {
  it('returns exactly the five signature headers', async () => {
    const headers = await signRequest('POST', 'https://api.example.test/browser_extensions/abc/commands/store_log', '{"a":1}', { privateKey });

    expect(Object.keys(headers).sort()).toEqual([
      HEADER_BODY_SHA256,
      HEADER_SIGNATURE,
      HEADER_SIGNATURE_NONCE,
      HEADER_SIGNATURE_TIMESTAMP,
      HEADER_SIGNATURE_VERSION
    ].sort());
    expect(headers[HEADER_SIGNATURE_VERSION]).toBe('1');
  });

  it('timestamp is RFC3339 UTC seconds (no milliseconds), honoring the clock offset above the threshold', async () => {
    const nowMs = Date.UTC(2026, 7, 20, 10, 0, 0, 456);
    const headers = await signRequest('GET', 'https://api.example.test/x', '', { privateKey, nowMs, clockOffsetMs: 60000 });

    expect(headers[HEADER_SIGNATURE_TIMESTAMP]).toBe('2026-08-20T10:01:00Z');
    expect(headers[HEADER_SIGNATURE_TIMESTAMP]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('nonce is 24 random bytes as padded base64url, fresh per call', async () => {
    const a = await signRequest('GET', 'https://api.example.test/x', '', { privateKey });
    const b = await signRequest('GET', 'https://api.example.test/x', '', { privateKey });

    expect(a[HEADER_SIGNATURE_NONCE]).not.toBe(b[HEADER_SIGNATURE_NONCE]);
    expect(b64urlToBytes(a[HEADER_SIGNATURE_NONCE]).length).toBe(24);
    expect(a[HEADER_SIGNATURE_NONCE]).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
    expect(a[HEADER_SIGNATURE_NONCE].length % 4).toBe(0);
  });

  it('signature covers path AND query — a tampered query fails verification', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const url = 'https://api.example.test/browser_extensions/abc/devices?limit=10';
    const headers = await signRequest('GET', url, '', { privateKey: pair.privateKey });

    const { default: buildCanonicalRequest } = await import('./canonicalRequest.js');
    const { verify: nodeVerify, createPublicKey } = await import('node:crypto');
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const signature = Buffer.from(b64urlToBytes(headers[HEADER_SIGNATURE]));

    const payloadFor = query => Buffer.from(buildCanonicalRequest({
      method: 'GET',
      path: '/browser_extensions/abc/devices',
      query,
      bodySha256: headers[HEADER_BODY_SHA256],
      timestamp: headers[HEADER_SIGNATURE_TIMESTAMP],
      nonce: headers[HEADER_SIGNATURE_NONCE]
    }), 'utf8');

    expect(nodeVerify('sha256', payloadFor('limit=10'), publicKey, signature)).toBe(true);
    expect(nodeVerify('sha256', payloadFor('limit=9999'), publicKey, signature)).toBe(false);
  });

  it('signs the percent-DECODED path (Go verifies r.URL.Path, which is decoded)', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const headers = await signRequest('GET', 'https://api.example.test/browser_extensions/abc%20def/devices', '', { privateKey: pair.privateKey });

    const { default: buildCanonicalRequest } = await import('./canonicalRequest.js');
    const { verify: nodeVerify, createPublicKey } = await import('node:crypto');
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const signature = Buffer.from(b64urlToBytes(headers[HEADER_SIGNATURE]));

    const payloadFor = path => Buffer.from(buildCanonicalRequest({
      method: 'GET',
      path,
      query: '',
      bodySha256: headers[HEADER_BODY_SHA256],
      timestamp: headers[HEADER_SIGNATURE_TIMESTAMP],
      nonce: headers[HEADER_SIGNATURE_NONCE]
    }), 'utf8');

    // The backend rebuilds the payload with the DECODED path — that form must verify.
    expect(nodeVerify('sha256', payloadFor('/browser_extensions/abc def/devices'), publicKey, signature)).toBe(true);
    expect(nodeVerify('sha256', payloadFor('/browser_extensions/abc%20def/devices'), publicKey, signature)).toBe(false);
  });

  it('uppercases the method and keeps an empty query line for query-less URLs', async () => {
    const { default: buildCanonicalRequest } = await import('./canonicalRequest.js');

    const payload = buildCanonicalRequest({
      method: 'delete',
      path: '/a',
      query: '',
      bodySha256: 'h',
      timestamp: 't',
      nonce: 'n'
    });

    expect(payload).toContain('method:DELETE');
    expect(payload).toContain('\nquery:\n');
  });

  it('throws without a private key', async () => {
    await expect(signRequest('GET', 'https://api.example.test/x', '')).rejects.toThrow(TypeError);
  });
});

describe('b64url helpers', () => {
  it('round-trips bytes with padding preserved', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x01, 0x02]);
    const encoded = bytesToB64url(bytes);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
    expect(encoded.length % 4).toBe(0);
    expect(Array.from(b64urlToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it('encodes 0xfb 0xff as URL-safe characters (- and _), never + or /', () => {
    const encoded = bytesToB64url(new Uint8Array([0xfb, 0xef, 0xff]));

    expect(encoded.includes('+')).toBe(false);
    expect(encoded.includes('/')).toBe(false);
  });
});
